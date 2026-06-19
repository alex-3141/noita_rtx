local luminosity = function(r, g, b)
    return math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b))
end

local create_table_fn = function(size, fn)
    local t = {}

    for i = 1, size do
        t[i] = fn(i)
    end

    return t
end

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

local sample_sdf = function(distance_field, x, y)
    -- Unpack distance field data (8 signed chars packed into each Lua number)
    local sdf_index = math.floor(y * DF_WIDTH + x)
    local packed_dist = distance_field[bit.rshift(sdf_index, 2) + 1] -- Packed distance, quick floor div 4
    local pack_index = bit.band(sdf_index, 0x3) -- fast mod 4
    local d = bit.band(bit.rshift(packed_dist, pack_index * 8), 0xFF) - 127
    return d
end

local cast_ray_occluded = function(distance_field, start_x, start_y, end_x, end_y, occlusion_threshold)

end

local generate_light_cells_2 = function(distance_field, light_pos_luminosity)
    local light_cell_lights = create_table(DF_HEIGHT * DF_WIDTH, 0x0)

    for i = 0, math.min(32, #light_pos_luminosity) -1 do
        local pos_luminosity = light_pos_luminosity[i + 1]

        local light_x = math.floor(math.min(DF_WIDTH - 1, math.max(0, pos_luminosity.x * DF_WIDTH - 1)))
        local light_y = math.floor(math.min(DF_HEIGHT - 1, math.max(0, pos_luminosity.y * DF_HEIGHT - 1)))

        if light_x < 0 or light_y < 0 or light_x > DF_WIDTH - 1 or light_y > DF_HEIGHT - 1 then
            error("Light position out of bounds. light_x: " .. light_x .. ", light_y: " .. light_y .. ", i: " .. i)
        end

        local base_luminosity = pos_luminosity.luminosity

        local r = math.sqrt( (base_luminosity / LUMINOSITY_THRESHOLD - 1.0) / FALLOFF_CLEAR )
        -- print(r)
        local max_max_penetration_depth = 0

        local r_squared = r * r
        local y_min = math.floor(math.min(DF_HEIGHT - 1, math.max(0, light_y - r)))
        local y_max = math.floor(math.min(DF_HEIGHT - 1, math.max(0, light_y + r)))

        for y = y_min, y_max do
            local dy = y - light_y
            local dy_squared = dy * dy
            local x_span_squared = r_squared - dy_squared

            if x_span_squared >= 0 then
                local x_offset = 0
                while (x_offset + 1) * (x_offset + 1) <= x_span_squared do
                    x_offset = x_offset + 1
                end

                local x_min = math.floor(math.min(DF_WIDTH - 1, math.max(0, light_x - x_offset)))
                local x_max = math.floor(math.min(DF_WIDTH - 1, math.max(0, light_x + x_offset)))
                for x = x_min, x_max do
                    local index = y * DF_WIDTH + x
                    if index >= 0 then

                        local dx = x - light_x
                        local dx_squared = dx * dx
                        local distance_to_target_squared = dx_squared + dy_squared
                        local distance_to_target = math.sqrt(distance_to_target_squared)

                        local distance_to_target_squared_pixels = dx_squared * pixel_size * pixel_size + dy_squared * pixel_size * pixel_size
                        local effective_luminosity = base_luminosity * (1 / (1 + FALLOFF_CLEAR * distance_to_target_squared_pixels))
                        local max_penetration_depth = math.sqrt((effective_luminosity - LUMINOSITY_THRESHOLD) / (FALLOFF_OCCLUDER * LUMINOSITY_THRESHOLD))
                        max_max_penetration_depth = math.max(max_max_penetration_depth, max_penetration_depth)

                        local dt = 0
                        local total_penetration_depth = 0
                        local dirx = (light_x - x) / distance_to_target
                        local diry = (light_y - y) / distance_to_target

                        for step = 1, 32 do
                            local sdf_x = math.floor(x + dirx * dt)
                            local sdf_y = math.floor(y + diry * dt)

                            -- Overrun checks
                            if sdf_x < 0 or sdf_y < 0 or sdf_x > DF_WIDTH - 1 or sdf_y > DF_HEIGHT - 1 then
                                error("DF sample position out of bounds. tempx: " .. sdf_x .. ", tempy: " .. sdf_y .. ", x: " .. x .. ", y: " .. y .. ", index: " .. index .. ", step: " .. step .. ", dt: " .. dt .. ", dirx: " .. dirx .. ", diry: " .. diry .. ", distance_to_target: " .. distance_to_target)
                            end

                            local d = sample_sdf(distance_field, sdf_x, sdf_y)

                            -- -- A small amount of wall penetration is allowed
                            if d < 0 then
                                total_penetration_depth = total_penetration_depth - d

                                if total_penetration_depth >= max_penetration_depth then
                                    break
                                end
                            end

                            dt = dt + math.max(1, math.abs(d))

                            if dt >= distance_to_target then
                                light_cell_lights[index + 1] = bit.bor(light_cell_lights[index + 1], bit.lshift(1, i))
                                break
                            end
                        end
                    else
                        error("Index out of bounds: " .. index)
                    end
                end
            end
        end


        -- print(max_max_penetration_depth)

    end


    return light_cell_lights
end

local get_light_sources = function()
    local camera_x, camera_y = GameGetCameraPos()

    -- Get all entities in the world
    -- TOOD: can this be made more efficient?
    local allEnts = EntityGetInRadius(camera_x, camera_y, 250)

    local lights = {}

    for _, ent in ipairs(allEnts) do
        LightComponents = EntityGetComponent(ent, "LightComponent")
        if LightComponents ~= nil then
            for _, comp in ipairs(LightComponents) do
                local isEnabled = ComponentGetIsEnabled(comp)
                if comp ~= nil and isEnabled then
                    local light_x, light_y = EntityGetTransform(ent)
                    -- TODO: Test how entity rotation effects this
                    light_x = light_x + ComponentGetValue2(comp, 'offset_x')
                    light_y = light_y + ComponentGetValue2(comp, 'offset_y')
                    local x, y = worldToShaderPos(light_x, light_y)
                    if x > 0 and x <= 1 and y > 0 and y <= 1 then

                        local r = ComponentGetValue2(comp, 'r') / 255
                        local g = ComponentGetValue2(comp, 'g') / 255
                        local b = ComponentGetValue2(comp, 'b') / 255

                        local base_luminosity = luminosity_srgb(r, g, b)
                        local radius = ComponentGetValue2(comp, 'radius')

                        local luminosity = base_luminosity * radius / pixel_size

                        table.insert(lights, { r = r, g = g, b = b, x = x, y = y, luminosity = luminosity})
                    end
                end
            end
        end
    end

    return lights
end

local generate = function(distance_field)

    local lights = get_light_sources()
    -- 1. Create a grid of cells for the light lists to be stored in
    -- 2. For each light, calculate the max distance the light has influence over
    -- 3. Go over each cell in that light's radius and perform ray marching to determine if any of the pixels in that cell are lit by the light. If so, add the light to that cell's list

    local cells = create_table_fn(CELL_GRID_HEIGHT * CELL_GRID_WIDTH, function() return {0, 0} end)

    -- Ground truth - all cells reference all lights

    local list = {}
    for i = 0, #lights do
        table.insert(list, i)
    end

    for _, cell in pairs(cells) do
        cell[1] = 0
        cell[2] = #lights
    end

    return lights, list, cells
end

return {
    generate = generate
}