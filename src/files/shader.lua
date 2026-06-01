local patch  = dofile_once("mods/noita_rtx/files/patches/post_final.frag.patch.lua")
local shadercode  = ModTextFileGetContent("data/shaders/post_final.frag")

local apply_patches = function()
    local patched_shadercode = patch.apply(shadercode)
    ModTextFileSetContent("data/shaders/post_final.frag", patched_shadercode)
end

return {
    apply_patches = apply_patches
}