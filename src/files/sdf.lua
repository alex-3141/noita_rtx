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

return {
    generate_signed_distance_field = generate_signed_distance_field
}
