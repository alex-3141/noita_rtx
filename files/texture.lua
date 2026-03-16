dofile_once("mods/noita_rtx/files/constants.lua")

local createLightTexture = function()
    LIGHT_TEXTURE = ModImageMakeEditable("rl_lights.png", DF_WIDTH, DF_HEIGHT)
end

local create_light_list_texture = function()
    -- Images need to be at least 2 pixels high.
    -- TODO: Arrange data to make use of manditory second row
    LIGHT_LIST_TEXTURE = ModImageMakeEditable("rl_light_list.png", GLOBAL_LIGHT_COUNT * 2, 2)
end

local createDistanceFieldTexture = function()
    local pixel_size = 8
    local border_size = 8
    local frame_width = 430 / pixel_size
    local frame_height = 242 / pixel_size

    local grid_width = frame_width + border_size * 2
    local grid_height = frame_height + border_size * 2
    DISTANCE_FIELD_TEXTURE = ModImageMakeEditable("rl_df.png", grid_width, grid_height)
end

local clearLightTexture = function()
    for y = 0, LIGHT_TEXTURE_HEIGHT - 1, 1 do
        for x = 0, LIGHT_TEXTURE_WIDTH - 1, 1 do
            ModImageSetPixel(LIGHT_TEXTURE, x, y, 0x00000000)
        end
    end
    GameSetPostFxTextureParameter("RL_tex_lights", "rl_lights.png", 1, 0, true)
end

local writeLightBucketData = function(x, y, lights)
    local bit = bit
    local ModImageSetPixel = ModImageSetPixel
    local count = #lights

    ModImageSetPixel(LIGHT_TEXTURE, x + 0, y, count)

    for i = 0, count, 1 do
        local light0 = lights[i]
        local light1 = lights[i + 1] or { x = 0, y = 0, r = 0, g = 0, b = 0 }
        local x0, y0, r0, g0, b0, x1, y1, r1, g1, b1 = light0.x, light0.y, light0.r, light0.g, light0.b, light1.x,
            light1.y, light1.r, light1.g, light1.b

        -- Bytes
        local _r0 = r0 * 255
        local _g0 = g0 * 255
        local _b0 = b0 * 255
        local _r1 = r1 * 255
        local _g1 = g1 * 255
        local _b1 = b1 * 255
        local _x0_high = bit.rshift(x0 * 4095, 4)
        local _y0_high = bit.rshift(y0 * 4095, 4)
        local _xy0_low = bit.lshift(bit.band(x0 * 4095, 0x0f), 4) + bit.band(y0 * 4095, 0x0f)
        local _x1_high = bit.rshift(x1 * 4095, 4)
        local _y1_high = bit.rshift(y1 * 4095, 4)
        local _xy1_low = bit.lshift(bit.band(x1 * 4095, 0x0f), 4) + bit.band(y1 * 4095, 0x0f)

        -- Pixels
        local pixel0 = bit.lshift(_r0, 24) + bit.lshift(_g0, 16) + bit.lshift(_b0, 8) + _x0_high
        local pixel1 = bit.lshift(_y0_high, 24) + bit.lshift(_xy0_low, 16) + bit.lshift(_r1, 8) + _g1
        local pixel2 = bit.lshift(_b1, 24) + bit.lshift(_x1_high, 16) + _y1_high + _xy1_low

        local x_index = x * LIGHT_BUCKET_PIXELS + i * 3

        ModImageSetPixel(LIGHT_TEXTURE, x_index + 0, y, pixel0)
        ModImageSetPixel(LIGHT_TEXTURE, x_index + 1, y, pixel1)
        ModImageSetPixel(LIGHT_TEXTURE, x_index + 2, y, pixel2)
    end
end

local texture = {}

texture.createTextures = function()
    createLightTexture()
    -- createDistanceFieldTexture()
    create_light_list_texture()
    -- writeLightBucketData()
end


texture.pushLightBuckets = function(lightBuckets)
    if LIGHT_TEXTURE == nil then
        return
    end

    clearLightTexture()

    for x = 0, LIGHT_TEXTURE_WIDTH - 1, 1 do
        for y = 0, LIGHT_TEXTURE_HEIGHT - 1, 1 do
            writeLightBucketData(x, y, lightBuckets[y][x] or {})
        end
    end


    GameSetPostFxTextureParameter("RL_tex_lights", "rl_lights.png", 1, 0, true)
end

texture.push_light_cells = function(light_cells, lights)
    if LIGHT_TEXTURE == nil or LIGHT_LIST_TEXTURE == nil then
        return
    end

    for y = 0, DF_HEIGHT - 1, 1 do
        for x = 0, DF_WIDTH - 1, 1 do
            local cell = bit.band(light_cells[y * DF_WIDTH + x + 1], 0xFFFFFFFF)
            ModImageSetPixel(LIGHT_TEXTURE, x, y, cell)
        end
    end

    for i = 0, math.min(#lights, GLOBAL_LIGHT_COUNT) - 1 do
        local light = lights[i + 1]
        local r = bit.band(math.max(0, light.r * 255), 0xFF)
        local g = bit.band(math.max(0, light.g * 255), 0xFF)
        local b = bit.band(math.max(0, light.b * 255), 0xFF)
        local x = bit.band(math.max(0, light.x * 255), 0xFF)
        local y = bit.band(math.max(0, light.y * 255), 0xFF)
        local luminosity = bit.band(math.max(0, light.luminosity * 32.0), 0xFF)
        ModImageSetPixel(LIGHT_LIST_TEXTURE, i * 2, 1, bit.lshift(luminosity, 16) + bit.lshift(y, 8) + x)
        ModImageSetPixel(LIGHT_LIST_TEXTURE, i * 2 + 1, 1, bit.lshift(b, 16) + bit.lshift(g, 8) + r)
    end

    GameSetPostFxTextureParameter("RL_tex_lights", "rl_lights.png", 1, 0, true)
    GameSetPostFxTextureParameter("RL_tex_light_list", "rl_light_list.png", 1, 0, true)
end

texture.push_distance_field = function(distance_field)
    for y = 1, DF_HEIGHT do
        for x = 1, DF_WIDTH do
            local d = distance_field[y][x]
            ModImageSetPixel(DISTANCE_FIELD_TEXTURE, x - 1, y - 1, math.abs(d) / 100)
        end
    end
    GameSetPostFxTextureParameter("RL_tex_df", "rl_df.png", 1, 0, true)
end

return texture
