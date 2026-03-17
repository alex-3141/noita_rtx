dofile("mods/noita_rtx/files/constants.lua")

local materials = dofile_once("mods/noita_rtx/files/materials.lua")
local sdf = dofile_once("mods/noita_rtx/files/sdf.lua")
local texture = dofile_once("mods/noita_rtx/files/texture.lua")
local scanner = dofile_once("mods/noita_rtx/files/scanner.lua")

-- Cache globals
local GameGetCameraPos = GameGetCameraPos
local EntityGetInRadius = EntityGetInRadius
local EntityGetComponent = EntityGetComponent
local ComponentGetIsEnabled = ComponentGetIsEnabled
local ComponentGetValue2 = ComponentGetValue2
local EntityGetTransform = EntityGetTransform

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
    local allEnts = EntityGetInRadius(camera_x, camera_y, 4000)

    local lights_pos_luminosity = {}
    local lights = {}

    for _, ent in ipairs(allEnts) do
        LightComponents = EntityGetComponent(ent, "LightComponent")
        if LightComponents ~= nil then
            for _, comp in ipairs(LightComponents) do
                local isEnabled = ComponentGetIsEnabled(comp)
                if comp ~= nil and isEnabled then
                    local light_x, light_y = EntityGetTransform(ent)
                    light_x = light_x + ComponentGetValue2(comp, 'offset_x')
                    light_y = light_y + ComponentGetValue2(comp, 'offset_y')
                    local x, y = worldToShaderPos(light_x, light_y)
                    if x > 0 and x <= 1 and y > 0 and y <= 1 then

                        local r = ComponentGetValue2(comp, 'r') / 255
                        local g = ComponentGetValue2(comp, 'g') / 255
                        local b = ComponentGetValue2(comp, 'b') / 255

                        local base_luminosity = luminosity_srgb(r, g, b)
                        local radius = ComponentGetValue2(comp, 'radius')

                        local adjusted_luminosity = base_luminosity * radius / pixel_size

                        -- For packign into global light list texture
                        table.insert(lights,
                            { r = r, g = g, b = b, x = x, y = y, luminosity = adjusted_luminosity })

                        -- For cell culling
                        table.insert(lights_pos_luminosity,
                            { x = x, y = y, luminosity = adjusted_luminosity })

                    end
                end
            end
        end
    end

    return lights, lights_pos_luminosity
end

local init = function()
    texture.createTextures()
    materials.patch()
end

local previous_camera_pos_0 = { x = 0, y = 0 }
local previous_camera_pos_1 = { x = 0, y = 0 }

local update = function()

    local binary_map = scanner.scan_world()
    local distance_field = sdf.generate_signed_distance_field(binary_map)
    local lights, lights_pos_luminosity = get_light_sources()
    -- local light_cell_lights, light_cell_colors = sdf.generate_light_cells(distance_field, light_color, light_pos_luminosity)
    local light_cells = sdf.generate_light_cells_2(distance_field, lights_pos_luminosity)

    texture.push_light_cells(light_cells, lights)
    -- GamePrint("Point lights: " .. tostring(#lights))

    local cam_x, cam_y = GameGetCameraPos()
    cam_x = math.floor(cam_x + 0.5)
    cam_y = math.floor(cam_y)

    local delta_x = cam_x - previous_camera_pos_1.x
    local delta_y = cam_y - previous_camera_pos_1.y
    GameSetPostFxParameter("RL_data", delta_x, delta_y, 0, 0)

    previous_camera_pos_1 = previous_camera_pos_0
    previous_camera_pos_0 = { x = cam_x, y = cam_y }
end

return {
    init = init,
    update = update
}