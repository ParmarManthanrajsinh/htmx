#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <string_view>
#include <unordered_map>
#include <cstdint>
#include <cstddef>
#include <algorithm>
#include <cassert>

using namespace emscripten;

enum PatchKind : uint8_t
{
    SetAttr = 0,
    RemoveAttr = 1,
    UpdateText = 2,
    MoveNode = 3,
    InsertNode = 4,
    RemoveNode = 5
};

struct PatchOp
{
    uint8_t kind;
    uint32_t target_idx;
    uint32_t parent_idx;
    int32_t sibling_idx;
    uint32_t key_id;
    uint32_t val_id;
};

struct NodeRecord
{
    uint32_t tag_id;
    uint32_t attrs_offset;
    uint32_t attrs_count;
    int32_t first_child;
    int32_t next_sibling;
};

struct AttributeRecord
{
    uint32_t key_id;
    uint32_t val_id;
};

struct ParsedTree
{
    std::vector<NodeRecord> nodes;
    std::vector<AttributeRecord> attrs;
    std::vector<std::string> strings;
};

static ParsedTree parse_tree_from_val(val input)
{
    val nodes_array = input["nodes"];
    val attrs_array = input["attrs"];
    val strings_array = input["strings"];

    size_t nodes_len = nodes_array["length"].as<size_t>();
    size_t attrs_len = attrs_array["length"].as<size_t>();
    size_t strings_len = strings_array["length"].as<size_t>();

    ParsedTree tree;
    tree.nodes.resize(nodes_len / 5);
    for (size_t i = 0; i < nodes_len; i += 5)
    {
        size_t idx = i / 5;
        tree.nodes[idx].tag_id = nodes_array[i].as<uint32_t>();
        tree.nodes[idx].attrs_offset = nodes_array[i+1].as<uint32_t>();
        tree.nodes[idx].attrs_count = nodes_array[i+2].as<uint32_t>();
        tree.nodes[idx].first_child = nodes_array[i+3].as<int32_t>();
        tree.nodes[idx].next_sibling = nodes_array[i+4].as<int32_t>();
    }

    tree.attrs.resize(attrs_len / 2);
    for (size_t i = 0; i < attrs_len; i += 2)
    {
        size_t idx = i / 2;
        tree.attrs[idx].key_id = attrs_array[i].as<uint32_t>();
        tree.attrs[idx].val_id = attrs_array[i+1].as<uint32_t>();
    }

    tree.strings.reserve(strings_len);
    for (size_t i = 0; i < strings_len; i++)
    {
        tree.strings.emplace_back(strings_array[i].as<std::string>());
    }

    return tree;
}

// Diff two nodes and generate patches
static void diff_nodes(size_t old_idx, size_t new_idx, const ParsedTree& old_tree, const ParsedTree& new_tree, std::vector<PatchOp>& patches)
{
    const auto& old_node = old_tree.nodes[old_idx];
    const auto& new_node = new_tree.nodes[new_idx];

    // Map attribute name string_view -> value string_view for old node
    std::unordered_map<std::string_view, std::string_view> old_attr_map;
    old_attr_map.reserve(old_node.attrs_count);
    for (size_t i = 0; i < old_node.attrs_count; i++)
    {
        const auto& attr = old_tree.attrs[old_node.attrs_offset + i];
        if (attr.key_id < old_tree.strings.size() && attr.val_id < old_tree.strings.size())
        {
            std::string_view key = old_tree.strings[attr.key_id];
            std::string_view val = old_tree.strings[attr.val_id];
            old_attr_map[key] = val;
        }
    }

    std::unordered_map<std::string_view, bool> processed_attrs;
    processed_attrs.reserve(new_node.attrs_count);
    for (size_t i = 0; i < new_node.attrs_count; i++)
    {
        const auto& attr = new_tree.attrs[new_node.attrs_offset + i];
        if (attr.key_id >= new_tree.strings.size() || attr.val_id >= new_tree.strings.size()) continue;

        std::string_view key = new_tree.strings[attr.key_id];
        std::string_view val = new_tree.strings[attr.val_id];
        processed_attrs[key] = true;

        auto it = old_attr_map.find(key);
        if (it == old_attr_map.end() || it->second != val)
        {
            if (new_tree.strings[new_node.tag_id] == "#text" && key == "nodeValue")
            {
                patches.emplace_back(PatchOp{PatchKind::UpdateText, static_cast<uint32_t>(old_idx), 0, -1, 0, attr.val_id});
            }
            else
            {
                patches.emplace_back(PatchOp{PatchKind::SetAttr, static_cast<uint32_t>(old_idx), 0, -1, attr.key_id, attr.val_id});
            }
        }
    }

    for (const auto& kv : old_attr_map)
    {
        if (processed_attrs.find(kv.first) == processed_attrs.end())
        {
            for (size_t i = 0; i < old_node.attrs_count; i++)
            {
                const auto& attr = old_tree.attrs[old_node.attrs_offset + i];
                if (attr.key_id < old_tree.strings.size() && old_tree.strings[attr.key_id] == kv.first)
                {
                    patches.emplace_back(PatchOp{PatchKind::RemoveAttr, static_cast<uint32_t>(old_idx), 0, -1, attr.key_id, 0});
                    break;
                }
            }
        }
    }

    // Collect children with vector reservation
    std::vector<int32_t> old_children;
    old_children.reserve(8);
    for (int32_t c = old_node.first_child; c != -1; c = old_tree.nodes[c].next_sibling)
    {
        old_children.emplace_back(c);
    }

    std::vector<int32_t> new_children;
    new_children.reserve(8);
    for (int32_t c = new_node.first_child; c != -1; c = new_tree.nodes[c].next_sibling)
    {
        new_children.emplace_back(c);
    }

    // Match positional children
    size_t min_len = std::min(old_children.size(), new_children.size());
    for (size_t i = 0; i < min_len; i++)
    {
        diff_nodes(old_children[i], new_children[i], old_tree, new_tree, patches);
    }

    // Extra new children -> Insert
    for (size_t i = min_len; i < new_children.size(); i++)
    {
        patches.emplace_back(PatchOp{PatchKind::InsertNode, static_cast<uint32_t>(new_children[i]), static_cast<uint32_t>(old_idx), -1, 0, 0});
    }

    // Extra old children -> Remove
    for (size_t i = min_len; i < old_children.size(); i++)
    {
        patches.emplace_back(PatchOp{PatchKind::RemoveNode, static_cast<uint32_t>(old_children[i]), static_cast<uint32_t>(old_idx), -1, 0, 0});
    }
}

val compute_diff(val old_encoded, val new_encoded)
{
    ParsedTree old_tree = parse_tree_from_val(old_encoded);
    ParsedTree new_tree = parse_tree_from_val(new_encoded);

    std::vector<PatchOp> patches;
    if (!old_tree.nodes.empty() && !new_tree.nodes.empty())
    {
        diff_nodes(0, 0, old_tree, new_tree, patches);
    }

    val out_patches = val::array();
    for (const auto& p : patches)
    {
        val op = val::object();
        op.set("kind", p.kind);
        op.set("target_idx", p.target_idx);
        op.set("parent_idx", p.parent_idx);
        op.set("sibling_idx", p.sibling_idx);
        op.set("key_id", p.key_id);
        op.set("val_id", p.val_id);
        out_patches.call<void>("push", op);
    }

    return out_patches;
}

val roundtrip_test(val input)
{
    ParsedTree tree = parse_tree_from_val(input);

    val out_nodes = val::array();
    for (const auto& n : tree.nodes)
    {
        out_nodes.call<void>("push", n.tag_id);
        out_nodes.call<void>("push", n.attrs_offset);
        out_nodes.call<void>("push", n.attrs_count);
        out_nodes.call<void>("push", n.first_child);
        out_nodes.call<void>("push", n.next_sibling);
    }

    val out_attrs = val::array();
    for (const auto& a : tree.attrs)
    {
        out_attrs.call<void>("push", a.key_id);
        out_attrs.call<void>("push", a.val_id);
    }

    val out_strings = val::array();
    for (const auto& s : tree.strings)
    {
        out_strings.call<void>("push", s);
    }

    val res = val::object();
    res.set("nodes", out_nodes);
    res.set("attrs", out_attrs);
    res.set("strings", out_strings);
    return res;
}

val compute_morph_patch(uintptr_t old_ptr, size_t old_len,
                        uintptr_t new_ptr, size_t new_len)
{
    return val::array();
}

EMSCRIPTEN_BINDINGS(morph_module)
{
    function("compute_morph_patch", &compute_morph_patch);
    function("compute_diff", &compute_diff);
    function("roundtrip_test", &roundtrip_test);
}
