#include <emscripten/bind.h>
#include <vector>
#include <string>
#include <string_view>
#include <unordered_map>
#include <cstdint>
#include <cstddef>
#include <algorithm>
#include <cstring>
#include <cassert>

using namespace emscripten;

enum PatchKind : uint32_t
{
    SetAttr = 0,
    RemoveAttr = 1,
    UpdateText = 2,
    MoveNode = 3,
    InsertNode = 4,
    RemoveNode = 5
};

#pragma pack(push, 1)
struct PatchOp
{
    uint32_t kind;
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

struct HeaderRecord
{
    uint32_t nodes_count;
    uint32_t attrs_count;
    uint32_t strings_count;
    uint32_t strings_bytes_len;
};

struct StringRecord
{
    uint32_t offset;
    uint32_t length;
};
#pragma pack(pop)

struct BinaryTreeDecoder
{
    const HeaderRecord* header;
    const NodeRecord* nodes;
    const AttributeRecord* attrs;
    const StringRecord* str_recs;
    const char* str_bytes;

    bool init(const uint8_t* buffer, size_t len)
    {
        if (len < sizeof(HeaderRecord)) return false;
        header = reinterpret_cast<const HeaderRecord*>(buffer);

        size_t expected_size = sizeof(HeaderRecord)
            + header->nodes_count * sizeof(NodeRecord)
            + header->attrs_count * sizeof(AttributeRecord)
            + header->strings_count * sizeof(StringRecord)
            + header->strings_bytes_len;

        if (len < expected_size) return false;

        const uint8_t* ptr = buffer + sizeof(HeaderRecord);
        nodes = reinterpret_cast<const NodeRecord*>(ptr);
        ptr += header->nodes_count * sizeof(NodeRecord);

        attrs = reinterpret_cast<const AttributeRecord*>(ptr);
        ptr += header->attrs_count * sizeof(AttributeRecord);

        str_recs = reinterpret_cast<const StringRecord*>(ptr);
        ptr += header->strings_count * sizeof(StringRecord);

        str_bytes = reinterpret_cast<const char*>(ptr);
        return true;
    }

    std::string_view getString(uint32_t string_id) const
    {
        if (string_id >= header->strings_count) return std::string_view();
        const auto& rec = str_recs[string_id];
        if (rec.offset + rec.length > header->strings_bytes_len) return std::string_view();
        return std::string_view(str_bytes + rec.offset, rec.length);
    }

    std::string_view getIdAttr(const NodeRecord& node) const
    {
        for (uint32_t i = 0; i < node.attrs_count; i++)
        {
            const auto& attr = attrs[node.attrs_offset + i];
            if (getString(attr.key_id) == "id")
            {
                return getString(attr.val_id);
            }
        }
        return std::string_view();
    }
};

static void diff_tree_nodes(
    int32_t old_idx,
    int32_t new_idx,
    const BinaryTreeDecoder& old_tree,
    const BinaryTreeDecoder& new_tree,
    std::vector<PatchOp>& patches)
{
    const auto& old_node = old_tree.nodes[old_idx];
    const auto& new_node = new_tree.nodes[new_idx];

    // Diff Attributes
    std::unordered_map<std::string_view, std::string_view> old_attr_map;
    old_attr_map.reserve(old_node.attrs_count);
    for (uint32_t i = 0; i < old_node.attrs_count; i++)
    {
        const auto& attr = old_tree.attrs[old_node.attrs_offset + i];
        std::string_view key = old_tree.getString(attr.key_id);
        std::string_view val = old_tree.getString(attr.val_id);
        if (!key.empty())
        {
            old_attr_map[key] = val;
        }
    }

    std::unordered_map<std::string_view, bool> processed_attrs;
    processed_attrs.reserve(new_node.attrs_count);
    for (uint32_t i = 0; i < new_node.attrs_count; i++)
    {
        const auto& attr = new_tree.attrs[new_node.attrs_offset + i];
        std::string_view key = new_tree.getString(attr.key_id);
        std::string_view val = new_tree.getString(attr.val_id);
        if (key.empty()) continue;

        processed_attrs[key] = true;
        auto it = old_attr_map.find(key);
        if (it == old_attr_map.end() || it->second != val)
        {
            if (new_tree.getString(new_node.tag_id) == "#text" && key == "nodeValue")
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
            for (uint32_t i = 0; i < old_node.attrs_count; i++)
            {
                const auto& attr = old_tree.attrs[old_node.attrs_offset + i];
                if (old_tree.getString(attr.key_id) == kv.first)
                {
                    patches.emplace_back(PatchOp{PatchKind::RemoveAttr, static_cast<uint32_t>(old_idx), 0, -1, attr.key_id, 0});
                    break;
                }
            }
        }
    }

    // Children diffing with keyed matching
    std::vector<int32_t> old_children;
    for (int32_t c = old_node.first_child; c != -1; c = old_tree.nodes[c].next_sibling)
    {
        old_children.push_back(c);
    }

    std::vector<int32_t> new_children;
    for (int32_t c = new_node.first_child; c != -1; c = new_tree.nodes[c].next_sibling)
    {
        new_children.push_back(c);
    }

    std::unordered_map<std::string_view, int32_t> old_key_map;
    for (int32_t old_c : old_children)
    {
        std::string_view id_val = old_tree.getIdAttr(old_tree.nodes[old_c]);
        if (!id_val.empty())
        {
            old_key_map[id_val] = old_c;
        }
    }

    std::vector<bool> old_matched(old_children.size(), false);
    std::vector<bool> new_matched(new_children.size(), false);
    std::vector<int32_t> matched_old_idx(new_children.size(), -1);

    // Keyed match
    for (size_t i = 0; i < new_children.size(); i++)
    {
        int32_t new_c = new_children[i];
        std::string_view id_val = new_tree.getIdAttr(new_tree.nodes[new_c]);
        if (!id_val.empty())
        {
            auto it = old_key_map.find(id_val);
            if (it != old_key_map.end())
            {
                int32_t old_c = it->second;
                auto pos = std::find(old_children.begin(), old_children.end(), old_c);
                if (pos != old_children.end())
                {
                    size_t old_pos_idx = std::distance(old_children.begin(), pos);
                    old_matched[old_pos_idx] = true;
                    new_matched[i] = true;
                    matched_old_idx[i] = old_c;
                    diff_tree_nodes(old_c, new_c, old_tree, new_tree, patches);
                }
            }
        }
    }

    // Positional match for unkeyed remainders
    size_t old_unmatched_cursor = 0;
    for (size_t i = 0; i < new_children.size(); i++)
    {
        if (new_matched[i]) continue;
        while (old_unmatched_cursor < old_children.size() && old_matched[old_unmatched_cursor])
        {
            old_unmatched_cursor++;
        }
        if (old_unmatched_cursor < old_children.size())
        {
            int32_t old_c = old_children[old_unmatched_cursor];
            int32_t new_c = new_children[i];
            old_matched[old_unmatched_cursor] = true;
            new_matched[i] = true;
            matched_old_idx[i] = old_c;
            diff_tree_nodes(old_c, new_c, old_tree, new_tree, patches);
            old_unmatched_cursor++;
        }
    }

    // Emit Move & Insert patches in new child sequence order
    for (size_t i = 0; i < new_children.size(); i++)
    {
        int32_t sibling_idx = (i + 1 < new_children.size() && matched_old_idx[i + 1] != -1) ? matched_old_idx[i + 1] : -1;

        if (new_matched[i])
        {
            int32_t old_c = matched_old_idx[i];
            // Check if position shifted
            auto pos = std::find(old_children.begin(), old_children.end(), old_c);
            size_t orig_idx = std::distance(old_children.begin(), pos);
            if (orig_idx != i)
            {
                patches.emplace_back(PatchOp{PatchKind::MoveNode, static_cast<uint32_t>(old_c), static_cast<uint32_t>(old_idx), sibling_idx, 0, 0});
            }
        }
        else
        {
            // Insert patch
            int32_t new_c = new_children[i];
            patches.emplace_back(PatchOp{PatchKind::InsertNode, static_cast<uint32_t>(new_c), static_cast<uint32_t>(old_idx), sibling_idx, 0, 0});
        }
    }

    // Emit Remove patches for unmatched old children
    for (size_t i = 0; i < old_children.size(); i++)
    {
        if (!old_matched[i])
        {
            patches.emplace_back(PatchOp{PatchKind::RemoveNode, static_cast<uint32_t>(old_children[i]), static_cast<uint32_t>(old_idx), -1, 0, 0});
        }
    }
}

static std::vector<PatchOp> g_patch_buffer;

val compute_morph_patch(uintptr_t old_ptr, size_t old_len,
                        uintptr_t new_ptr, size_t new_len)
{
    g_patch_buffer.clear();

    BinaryTreeDecoder old_tree;
    BinaryTreeDecoder new_tree;

    if (!old_tree.init(reinterpret_cast<const uint8_t*>(old_ptr), old_len) ||
        !new_tree.init(reinterpret_cast<const uint8_t*>(new_ptr), new_len))
    {
        return val::object();
    }

    if (old_tree.header->nodes_count == 0 || new_tree.header->nodes_count == 0)
    {
        return val::object();
    }

    // Root tag mismatch handling
    std::string_view old_root_tag = old_tree.getString(old_tree.nodes[0].tag_id);
    std::string_view new_root_tag = new_tree.getString(new_tree.nodes[0].tag_id);

    if (old_root_tag != new_root_tag)
    {
        g_patch_buffer.emplace_back(PatchOp{PatchKind::InsertNode, 0, 0, -1, 0, 0});
        g_patch_buffer.emplace_back(PatchOp{PatchKind::RemoveNode, 0, 0, -1, 0, 0});
    }
    else
    {
        diff_tree_nodes(0, 0, old_tree, new_tree, g_patch_buffer);
    }

    val res = val::object();
    res.set("ptr", reinterpret_cast<uintptr_t>(g_patch_buffer.data()));
    res.set("count", g_patch_buffer.size());
    return res;
}

EMSCRIPTEN_BINDINGS(morph_module)
{
    function("compute_morph_patch", &compute_morph_patch);
}

