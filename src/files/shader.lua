local patch  = dofile_once("mods/noita_rtx/files/patches/post_final.frag.patch.lua")
local shadercode  = ModTextFileGetContent("data/shaders/post_final.frag")

-- Upgrade other mod's code to work with version 400
local upversion = function(shadercode)
    -- Replace `gl_FragColor' with 'outColor'
    shadercode = shadercode:gsub("gl_FragColor", "outColor")

    -- Replace gl_TexCoord[0] with tex_coord_
    shadercode = shadercode:gsub("gl_TexCoord%[0%]", "tex_coord_")
    return shadercode
end


local apply_patches = function()
    shadercode = upversion(shadercode)

    local patched_shadercode = patch.apply(shadercode)
    ModTextFileSetContent("data/shaders/post_final.frag", patched_shadercode)
end

return {
    apply_patches = apply_patches
}