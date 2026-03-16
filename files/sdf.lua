-- Create and return empty table of size
local create_table = function(size, default_value)
    local t = {}

    for i = 1, size do
        t[i] = default_value
    end

    return t
end

-- Create and return 2D table of size
local create_table_2d = function(height, width, default_value)
    local t = {}

    for y = 1, height do
        t[y] = create_table(width, default_value)
    end

    return t
end

local copy_shallow = function(table)
    local new_table = {}
    for k, v in pairs(table) do
        new_table[k] = v
    end
    return new_table
end

-- Linear time EDT  (positive only)
-- https://arxiv.org/abs/2106.03503
-- https://pure.rug.nl/ws/files/3059926/2002CompImagVisMeijster.pdf
local horizontal_pass = function(distMat)
    local maxDist = 9999999999
    local intersections = {}
    for x = 1, #distMat[1] + 1 do
        intersections[x] = 0
    end
    local contributors = {}
    for x = 1, #distMat[1] do
        contributors[x] = 0
    end

    for i = 1, #distMat do
        local distMatV = copy_shallow(distMat[i])
        local idx = 1
        intersections[1] = -maxDist
        contributors[1] = 1
        local p_idx = 1
        while p_idx < #distMat[1] do
            p_idx = p_idx + 1
            if distMatV[p_idx] < maxDist then
                local p_idx_2 = p_idx * p_idx
                local c = contributors[idx]
                local intersect = math.ceil((distMatV[p_idx] - distMatV[c] - c * c + p_idx_2) / (2 * (p_idx - c)))
                while intersect <= intersections[idx] do
                    idx = idx - 1
                    c = contributors[idx]
                    intersect = math.ceil((distMatV[p_idx] - distMatV[c] - c * c + p_idx_2) / (2 * (p_idx - c)))
                end
                if intersect <= #distMat[1] then
                    idx = idx + 1
                    intersections[idx] = math.max(1, intersect)
                    contributors[idx] = p_idx
                end
            end
        end
        intersections[1] = 1
        intersections[idx + 1] = #distMat[1] + 1
        for n = 1, idx do
            local k = contributors[n]
            for j = intersections[n], intersections[n + 1] - 1 do
                distMat[i][j] = distMatV[k] + (j - k) * (j - k)
            end
        end
    end
    return distMat
end


local vertical_pass = function(w)
    local df_positive = create_table_2d(#w, #w[1], math.huge)
    local df_negative = create_table_2d(#w, #w[1], math.huge)

    for x = 1, #w[1] do
        local head = true
        local lastHit = 1
        local currentHit = 1
        local inside = w[1][x]

        for y = 1, #w do
            local cell = w[y][x]
            if cell ~= inside then
                currentHit = y
                if head then
                    head = false
                    for i = lastHit, currentHit - 1 do
                        local dist = currentHit - i
                        local dist2 = dist * dist
                        if inside then
                            df_negative[i][x] = dist2
                            df_positive[i][x] = 0
                        else
                            df_positive[i][x] = dist2
                            df_negative[i][x] = 0
                        end
                    end
                else
                    for i = lastHit, currentHit - 1 do
                        local dist = math.min(i - lastHit + 1, currentHit - i)
                        local dist2 = dist * dist
                        if inside then
                            df_negative[i][x] = dist2
                            df_positive[i][x] = 0
                        else
                            df_positive[i][x] = dist2
                            df_negative[i][x] = 0
                        end
                    end
                end
                lastHit = currentHit
                inside = not inside
            end
        end
        if head then
            for i = 1, #w do
                if inside then
                    df_negative[i][x] = 10000
                    df_positive[i][x] = 0
                else
                    df_positive[i][x] = 10000
                    df_negative[i][x] = 0
                end
            end
        else
            for i = lastHit, #w do
                local dist = i - lastHit + 1
                local dist2 = dist * dist
                if inside then
                    df_negative[i][x] = dist2
                    df_positive[i][x] = 0
                else
                    df_positive[i][x] = dist2
                    df_negative[i][x] = 0
                end
            end
        end
    end

    return df_positive, df_negative
end

local combine_distance_fields = function(df_positive, df_negative)
    local df = create_table_2d(#df_positive, #df_positive[1], 0)

    for y = 1, #df do
        for x = 1, #df[1] do
            df[y][x] = df_positive[y][x] - df_negative[y][x]
        end
    end

    return df
end

local function flatten_distance_field(df)
    local flattened = create_table(#df * #df[1], 0)

    for y = 1, #df do
        for x = 1, #df[1] do
            flattened[(y - 1) * #df[1] + x] = df[y][x]
        end
    end

    return flattened
end

-- Pack distance field values as signed chars (euclidian distance), storing 4 per Lua number and 64 per cache line
local function pack_distance_field(df)

    local packed = create_table(math.ceil(#df / 4), 0)
    local num_packed = 0
    local num_processed = 0
    local builder = 0x0

    for i = 1, #df do
        local d = df[i]
        if d < 0 then
            d = math.min(-1, -math.sqrt(-d))
        else
            d = math.max(1, math.sqrt(d))
        end
        local value = math.floor(127 + math.min(math.max(-127, d), 127))
        builder = builder + bit.lshift(value, num_processed * 8)
        num_processed = num_processed + 1
        if num_processed == 4 then
            num_packed = num_packed + 1
            packed[num_packed] = builder
            num_processed = 0
            builder = 0x0
        end
    end

    return packed
end

local generate_signed_distance_field = function(binary_map)
    local df_positive, df_negative = vertical_pass(binary_map)

    df_positive = horizontal_pass(df_positive)
    df_negative = horizontal_pass(df_negative)

    local df = combine_distance_fields(df_positive, df_negative)
    df = flatten_distance_field(df)
    df = pack_distance_field(df)

    return df
end


local luminosity = function(r, g, b)
    return math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b))
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
                            local tempx = math.floor(x + dirx * dt)
                            local tempy = math.floor(y + diry * dt)

                            -- Overrun checks
                            if tempx < 0 or tempy < 0 or tempx > DF_WIDTH - 1 or tempy > DF_HEIGHT - 1 then
                                error("DF sample position out of bounds. tempx: " .. tempx .. ", tempy: " .. tempy .. ", x: " .. x .. ", y: " .. y .. ", index: " .. index .. ", step: " .. step .. ", dt: " .. dt .. ", dirx: " .. dirx .. ", diry: " .. diry .. ", distance_to_target: " .. distance_to_target)
                            end

                            -- Unpack distance field data (8 signed chars packed into each Lua number)
                            local sdf_index = math.floor(tempy * DF_WIDTH + tempx)
                            local packed_dist = distance_field[bit.rshift(sdf_index, 2) + 1] -- Packed distance, quick floor div 4
                            local pack_index = bit.band(sdf_index, 0x3) -- fast mod 4
                            local d = bit.band(bit.rshift(packed_dist, pack_index * 8), 0xFF) - 127

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

return {
    generate_signed_distance_field = generate_signed_distance_field,
    generate_light_cells_2 = generate_light_cells_2,
}
