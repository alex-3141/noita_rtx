dofile("mods/noita_rtx/files/constants.lua")

local config = dofile_once("mods/noita_rtx/config.lua")
local materials = dofile_once("mods/noita_rtx/files/materials.lua")
local sdf = dofile_once("mods/noita_rtx/files/sdf.lua")
local lights = dofile_once("mods/noita_rtx/files/lights.lua")
local texture = dofile_once("mods/noita_rtx/files/texture.lua")
local scanner = dofile_once("mods/noita_rtx/files/scanner.lua")
local shader = dofile_once("mods/noita_rtx/files/shader.lua")

local push_uniforms = function()
  local exposure = ModSettingGet("noita_rtx.exposure")
  local ambient = ModSettingGet("noita_rtx.ambient")
  local dust = ModSettingGet("noita_rtx.dust")
  GameSetPostFxParameter("RTX_exposure_ambient_dust", exposure, ambient, dust, 0.0)
end

local init = function()
    if not config.hot_reload then
        shader.apply_patches()
    end

    texture.create_textures()
    materials.patch()
end

local previous_camera_pos_0 = { x = 0, y = 0 }
local previous_camera_pos_1 = { x = 0, y = 0 }

local update = function()
    local light_sources = lights.get_light_sources()

    texture.push_lights(light_sources)

    local cam_x, cam_y = GameGetCameraPos()
    cam_x = math.floor(cam_x + 0.5)
    cam_y = math.floor(cam_y)

    local delta_x = cam_x - previous_camera_pos_1.x
    local delta_y = cam_y - previous_camera_pos_1.y
    GameSetPostFxParameter("RL_data", delta_x, delta_y, #light_sources, 0)

    previous_camera_pos_1 = previous_camera_pos_0
    previous_camera_pos_0 = { x = cam_x, y = cam_y }
end

return {
    init = init,
    update = update,
    push_uniforms = push_uniforms
}