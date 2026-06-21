dofile_once("mods/noita_rtx/files/constants.lua")
dofile_once("data/scripts/lib/utilities.lua")

-- Images need to be at least 2 pixels in height

-- Light color and positions
local create_light_texture = function()
    -- 2 Pixels per light - Color and Pos
    LIGHT_TEXTURE = ModImageMakeEditable("rl_lights.png", GLOBAL_LIGHT_COUNT, 2)
end

local create_textures = function()
    create_light_texture()
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

return {
    push_lights = push_lights,
    create_textures = create_textures
}