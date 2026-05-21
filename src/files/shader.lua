-- Mock things the diff_match_patch library expects
bit32 = bit
os = {
    clock = function()
        return 0
    end
}

local diff_match_patch = dofile_once("mods/noita_rtx/files/lib/diff_match_patch.lua")
local patch_text = ModTextFileGetContent("mods/noita_rtx/files/patches/post_final.frag.patch.txt")
local shadercode = ModTextFileGetContent("data/shaders/post_final.frag")

local patch = function()
    local patches = diff_match_patch.patch_fromText(patch_text)
    local shadercode = diff_match_patch.patch_apply(patches, shadercode)
    ModTextFileSetContent("data/shaders/post_final.frag", shadercode)
end

return {
    patch = patch
}