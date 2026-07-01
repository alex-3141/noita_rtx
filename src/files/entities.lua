local nxml = dofile_once("mods/noita_rtx/files/lib/nxml.lua")

-- Remove `effect_hit_ground` effect when entities land on the ground
local function patch_effect_hit_ground()
    for _, path in ipairs({
        "data/entities/player_base.xml",
        "data/entities/base_humanoid.xml",
        "data/entities/base_helpless_animal.xml",
        "data/entities/_debug/player_testwand.xml",
    }) do
        local xml = nxml.parse(ModTextFileGetContent(path))

        for comp in xml:each_of("CharacterDataComponent") do
            comp.attr.effect_hit_ground = "0"
        end

        ModTextFileSetContent(path, tostring(xml))
    end
end

local function patch()
    patch_effect_hit_ground()

    print("Entities Patched")
end


return {
    patch = patch
}