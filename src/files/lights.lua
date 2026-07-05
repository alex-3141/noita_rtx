local luminosity = function(r, g, b)
    return math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b))
end

local previous_light_count = 1
local previous_join_distance = MIN_LIGHT_JOIN_DISTANCE

local worldToShaderPos = function(x, y)
    -- World height remains constant, width is based on height and aspect ratio
    local height = VIRTUAL_RESOLUTION_Y
    local width = VIRTUAL_RESOLUTION_Y * ASPECT

    width = width / VIEWPORT_SCALE
    height = height / VIEWPORT_SCALE

    local cam_x, cam_y = GameGetCameraPos()
    local uv_x = (x - cam_x + width / 2) / width
    local uv_y = (y - cam_y + height / 2) / height

    return uv_x, uv_y
end

local get_light_sources = function()
    local camera_x, camera_y = GameGetCameraPos()

    -- Get all entities in the world
    -- TOOD: can this be made more efficient?
    local allEnts = EntityGetInRadius(camera_x, camera_y, 250)

    local joined_lights = {}
    local lights = {}
    local count = 0

    -- Dynamic hashing distance
    local join_distance = math.max(MIN_LIGHT_JOIN_DISTANCE, (previous_light_count / GLOBAL_LIGHT_MAX) * previous_join_distance)
    -- GamePrint(string.format("Light join distance: %.2f (previous count: %d, previous join distance: %.2f)", join_distance, previous_light_count, previous_join_distance))

    for _, ent in ipairs(allEnts) do
        local LightComponents = EntityGetComponent(ent, "LightComponent")
        if LightComponents ~= nil then
            for _, comp in ipairs(LightComponents) do
                count = count + 1
                local isEnabled = ComponentGetIsEnabled(comp)
                if comp == nil or not isEnabled then
                    goto continue
                end

                local light_x, light_y, rotation, scale_x, scale_y = EntityGetTransform(ent)
                local offset_x = ComponentGetValue2(comp, 'offset_x') * scale_x
                local offset_y = ComponentGetValue2(comp, 'offset_y') * scale_y

                -- Bake rotations and scale into x and y
                local cos_rot = math.cos(rotation)
                local sin_rot = math.sin(rotation)
                local world_x = light_x + offset_x * cos_rot - offset_y * sin_rot
                local world_y = light_y + offset_x * sin_rot + offset_y * cos_rot

                local x, y = worldToShaderPos(world_x, world_y)

                if x < 0 or y < 0 or x > 1 or y > 1 then
                    goto continue
                end

                -- srgb to rgb
                local r = math.pow(ComponentGetValue2(comp, 'r') / 255, GAMMA)
                local g = math.pow(ComponentGetValue2(comp, 'g') / 255, GAMMA)
                local b = math.pow(ComponentGetValue2(comp, 'b') / 255, GAMMA)

                local radius = ComponentGetValue2(comp, 'radius')
                local max_radius = 300
                local radius_norm = math.min(radius, max_radius) / max_radius

                r = r * radius_norm
                g = g * radius_norm
                b = b * radius_norm

                local luma_new = luminosity(r, g, b)

                if luma_new < 0.01 then
                    goto continue
                end

                local hash = math.floor(world_y / join_distance) * 10000 + math.floor(world_x / join_distance)

                if joined_lights[hash] == nil then
                    joined_lights[hash] = { r = r, g = g, b = b, x = x, y = y }
                else
                    -- Combine lights that are within the join distance
                    local current = joined_lights[hash]
                    local luma_current = luminosity(current.r, current.g, current.b)

                    joined_lights[hash].x = (current.x * luma_current + x * luma_new) / (luma_current + luma_new)
                    joined_lights[hash].y = (current.y * luma_current + y * luma_new) / (luma_current + luma_new)
                    joined_lights[hash].r = joined_lights[hash].r + r
                    joined_lights[hash].g = joined_lights[hash].g + g
                    joined_lights[hash].b = joined_lights[hash].b + b
                end

                ::continue::
            end
        end
    end

    for _, light in pairs(joined_lights) do
        table.insert(lights, light)
    end

    previous_light_count = #lights
    previous_join_distance = join_distance

    return lights
end

return {
    get_light_sources = get_light_sources
}