dofile_once("mods/noita_rtx/files/constants.lua")
dofile_once("data/scripts/lib/utilities.lua")

-- Images need to be at least 2 pixels in height

-- Light color and positions
local create_light_texture = function()
    -- 2 Pixels per light - Color and Pos
    LIGHT_TEXTURE = ModImageMakeEditable("rl_lights.png", GLOBAL_LIGHT_COUNT, 2)
end

-- Light pointer list
local create_light_list_texture = function()
    -- Each pixel holds 4 pointers, each cell can reference up to 256 lights
    LIGHT_LIST_TEXTURE = ModImageMakeEditable("rl_lights_list.png", MAX_LIGHTS / 2, 2)
end

local create_light_cells_texture = function()
    -- Each pixel contains 2 cells - Index (8 bits), Length (8 bits)
    LIGHT_CELLS_TEXTURE = ModImageMakeEditable("rl_lights_cells.png", CELL_TEXTURE_WIDTH, CELL_TEXTURE_HEIGHT)
end

local texture = {}

local create_textures = function()
    create_light_texture()
    create_light_list_texture()
    create_light_cells_texture()
end

local push_lights_cells = function(cells)
    if LIGHT_CELLS_TEXTURE == nil then
        return
    end


    for y = 0, CELL_TEXTURE_HEIGHT - 1 do
        for x = 0, CELL_TEXTURE_WIDTH - 1 do
            local cell_index = y * CELL_GRID_WIDTH + x

            local r = cells[cell_index * 2 + 1][1]
            local g = cells[cell_index * 2 + 1][2]
            local b = cells[cell_index * 2 + 2][1]
            local a = cells[cell_index * 2 + 2][2]

            local pixel = r
            pixel = bit.bor(pixel, bit.lshift(g, 8))
            pixel = bit.bor(pixel, bit.lshift(b, 16))
            pixel = bit.bor(pixel, bit.lshift(a, 24))

            ModImageSetPixel(LIGHT_CELLS_TEXTURE, x, y, pixel)
        end
    end

    GameSetPostFxTextureParameter("RL_tex_lights_cells", "rl_lights_cells.png", TEXTURE_FILTERING_MODE.NEAREST, TEXTURE_WRAPPING_MODE.CLAMP, true)
end

local push_lights = function(lights)
    if LIGHT_TEXTURE == nil then
        return
    end

    for index, light in pairs(lights) do
        -- 12 bits per value for x, y, r, g, b

        -- up to 255 is the limit for a single light. Allow up to 16x stacked lights
        local r = bit.band(math.min(light.r, 16) * 255, 0xFFF)
        local g = bit.band(math.min(light.g, 16) * 255, 0xFFF)
        local b = bit.band(math.min(light.b, 16) * 255, 0xFFF)
        local x = bit.band(light.x * 4095, 0xFFF)
        local y = bit.band(light.y * 4095, 0xFFF)

        local pixel_0 = 0x0
        pixel_0 = bit.bor(pixel_0, r)
        pixel_0 = bit.bor(pixel_0, bit.lshift(g, 12))
        pixel_0 = bit.bor(pixel_0, bit.lshift(b, 24))

        local pixel_1 = 0x0
        pixel_1 = bit.bor(pixel_1, bit.rshift(b, 8))
        pixel_1 = bit.bor(pixel_1, bit.lshift(x, 4))
        pixel_1 = bit.bor(pixel_1, bit.lshift(y, 16))

        ModImageSetPixel(LIGHT_TEXTURE, index - 1, 0, pixel_0)
        ModImageSetPixel(LIGHT_TEXTURE, index - 1, 1, pixel_1)
    end

    GameSetPostFxTextureParameter("RL_tex_lights", "rl_lights.png", TEXTURE_FILTERING_MODE.NEAREST, TEXTURE_WRAPPING_MODE.CLAMP, true)
end

local push_lights_list = function(list)
    local read_index = 0
    local channel_index = 0
    local pixel_index = 0
    local pixel = 0x00000000

    while read_index < #list do
        pixel = bit.bor(pixel, bit.lshift(list[read_index + 1], channel_index * 8))

        read_index = read_index + 1
        channel_index = channel_index + 1

        if channel_index == 4 or read_index == #list then
            ModImageSetPixel(LIGHT_LIST_TEXTURE, math.floor(pixel_index / 2), bit.band(pixel_index, 1), pixel)

            pixel = 0x00000000
            channel_index = 0
            pixel_index = pixel_index + 1
        end
    end

    GameSetPostFxTextureParameter("RL_tex_lights_list", "rl_lights_list.png", TEXTURE_FILTERING_MODE.NEAREST, TEXTURE_WRAPPING_MODE.CLAMP, true)
end

local push_distance_field = function(distance_field)
    for y = 1, DF_HEIGHT do
        for x = 1, DF_WIDTH do
            local d = distance_field[y][x]
            ModImageSetPixel(DISTANCE_FIELD_TEXTURE, x - 1, y - 1, math.abs(d) / 100)
        end
    end
    GameSetPostFxTextureParameter("RL_tex_df", "rl_df.png", 1, 0, true)
end

return {
    push_lights = push_lights,
    push_lights_list = push_lights_list,
    push_lights_cells = push_lights_cells,
    create_textures = create_textures
}