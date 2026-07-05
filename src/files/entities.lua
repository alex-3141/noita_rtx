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

local function patch_teleporter_lightcomponent_offsets()
    for _, path in ipairs({
        "data/entities/buildings/mystery_teleport.xml",
        "data/entities/buildings/mystery_teleport_back.xml",
        "data/entities/buildings/teleport_bunker.xml",
        "data/entities/buildings/teleport_bunker2.xml",
        "data/entities/buildings/teleport_bunker_back.xml",
        "data/entities/buildings/teleport_desert.xml",
        "data/entities/buildings/teleport_end_wall.xml",
        "data/entities/buildings/teleport_ending_victory_delay.xml",
        "data/entities/buildings/teleport_ending_victory.xml",
        "data/entities/buildings/teleport_ending.xml",
        "data/entities/buildings/teleport_excavationsite_cube_return.xml",
        "data/entities/buildings/teleport_hourglass_return.xml",
        "data/entities/buildings/teleport_hourglass.xml",
        "data/entities/buildings/teleport_liquid_powered.xml",
        "data/entities/buildings/teleport_meditation_cube_return.xml",
        "data/entities/buildings/teleport_meditation_cube.xml",
        "data/entities/buildings/teleport_robot_egg_return.xml",
        "data/entities/buildings/teleport_snowcave_buried_eye.xml",
        "data/entities/buildings/teleport_start.xml",
        "data/entities/buildings/teleport_teleroom_1.xml",
        "data/entities/buildings/teleport_teleroom_2.xml",
        "data/entities/buildings/teleport_teleroom_3.xml",
        "data/entities/buildings/teleport_teleroom_4.xml",
        "data/entities/buildings/teleport_teleroom_5.xml",
        "data/entities/buildings/teleport_teleroom_6.xml",
        "data/entities/buildings/teleport_teleroom.xml",
        "data/entities/misc/greed_curse/greed_ghost_portal.xml",
        "data/entities/projectiles/deck/summon_portal_teleport.xml",
        "data/entities/projectiles/deck/tentacle_portal.xml",
    }) do
        local xml = nxml.parse(ModTextFileGetContent(path))

        for comp in xml:each_of("LightComponent") do
            comp.attr.offset_x = "0"
            comp.attr.offset_y = "0"
        end

        ModTextFileSetContent(path, tostring(xml))
    end
end

local function patch()
    patch_effect_hit_ground()
    patch_teleporter_lightcomponent_offsets()
end


return {
    patch = patch
}