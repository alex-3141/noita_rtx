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
    -- Measure rl.update() execution time
    local frame_start_time = GameGetRealWorldTimeSinceStarted()

    -- Initialize measurement start time if needed
    if measurement_start_time == nil then
        measurement_start_time = frame_start_time
    end

    rtx.update()

    local frame_end_time = GameGetRealWorldTimeSinceStarted()
    local frame_elapsed_time = frame_end_time - frame_start_time

    -- Accumulate timing data
    total_elapsed_time = total_elapsed_time + frame_elapsed_time
    frame_count = frame_count + 1

    -- Check if measurement duration has passed
    local time_since_measurement_start = frame_end_time - measurement_start_time
    if time_since_measurement_start >= measurement_duration_seconds then
        -- Calculate and print average
        local average_time = total_elapsed_time / frame_count
        print(string.format("Average rl.update() time over %.1f sec (%d frames): %.5f ms",
              time_since_measurement_start, frame_count, average_time * 1000))

        -- Reset for next measurement period
        measurement_start_time = frame_end_time -- Start next period immediately
        total_elapsed_time = 0
        frame_count = 0
    end
end

function OnPlayerSpawned(player_entity)
    Player = player_entity

    -- Remove player light
    LightComponents = EntityGetComponent(player_entity, "LightComponent")
    if LightComponents and #LightComponents > 0 then
        for _, comp in ipairs(LightComponents) do
            EntityRemoveComponent(player_entity, comp)
        end
    end
end
