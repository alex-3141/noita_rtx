Player = nil

local rtx = dofile_once("mods/noita_rtx/files/rtx.lua")

-- Timing measurement state
local measurement_duration_seconds = 5.0
local measurement_start_time = nil
local total_elapsed_time = 0
local frame_count = 0

function OnModInit()
    rtx.init()
end

function OnWorldPostUpdate()
    rtx.update()
end

function OnPlayerSpawned(player_entity)
    Player = player_entity

    rtx.push_uniforms()

    -- Remove player light
    LightComponents = EntityGetComponent(player_entity, "LightComponent")
    if LightComponents and #LightComponents > 0 then
        for _, comp in ipairs(LightComponents) do
            EntityRemoveComponent(player_entity, comp)
        end
    end
end
