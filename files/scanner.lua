local RaytraceSurfaces = RaytraceSurfaces


-- Create and return empty table of size
local create_table = function(size)
    local t = {}

    for i = 1, size do
        t[i] = 0
    end

    return t
end

-- Create and return 2D table of size
local create_table_2d = function(height, width)
    local t = {}

    for y = 1, height do
        t[y] = create_table(width)
    end

    return t
end

local scan_pixel = function(x, y, size)
    for i = 0, size - 1 do
        local hit, hit_x, hit_y = RaytraceSurfaces(x, y + i, x + size, y + i)
        if hit then
            return true
        end
    end
    return false
end

local sample_grid_new = function()
    local world_x, world_y = GameGetCameraPos()

    local w = create_table_2d(DF_HEIGHT, DF_WIDTH)

    -- TODO: Clean this up
    for y = 1, DF_HEIGHT do
        for x = 1, DF_WIDTH do
            w[y][x] = scan_pixel(world_x - 430 / 2 - border_size * pixel_size + (x - 1) * pixel_size,
                world_y - 242 / 2 - border_size * pixel_size + (y - 1) * pixel_size, pixel_size)
        end
    end

    return w
end

local scan_world = function()
    local scan = sample_grid_new()
    return scan
end

return {
    scan_world = scan_world
}