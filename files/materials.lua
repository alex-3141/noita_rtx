local nxml = dofile_once("mods/noita_rtx/files/lib/nxml/nxml.lua")

local function colorToHex(color)
    color = {
        r = math.floor(color.r or 0),
        g = math.floor(color.g or 0),
        b = math.floor(color.b or 0),
    }
    if math.max(color.r, color.g, color.b) > 255 or math.min(color.r, color.g, color.b) < 0 then
        error("Color values must range from 0 and 255. Received: r=" .. color.r .. ", g=" .. color.g .. ", b=" .. color.b)
    end
    return string.format("FF%02X%02X%02X", color.b, color.g, color.r)
end

local function cleanHexString(hex)
    -- hex string sometimes has 0x prefix, remove it
    if hex:sub(1, 2) == "0x" then
        hex = hex:sub(3)
    end
    if #hex ~= 8 then
        error("Hex color must be 8 characters long: " .. hex)
    end
    if not hex:match("^[0-9A-Fa-f]+$") then
        error("Hex color must contain only hexadecimal characters: " .. hex)
    end
    return hex
end

local function wangColorToValues(cell)
    local hex = cell.attr.wang_color
    hex = cleanHexString(hex)
    local a = tonumber(hex:sub(1, 2), 16)
    -- These are in reverse order compared to gfx_glow_color
    local b = tonumber(hex:sub(3, 4), 16)
    local g = tonumber(hex:sub(5, 6), 16)
    local r = tonumber(hex:sub(7, 8), 16)

    return {r = r, g = g, b = b}
end

local function glowColorToValues(cell)
    local hex = cell.attr.gfx_glow_color
    hex = cleanHexString(hex)
    local a = tonumber(hex:sub(1, 2), 16)
    local r = tonumber(hex:sub(2, 3), 16)
    local g = tonumber(hex:sub(4, 5), 16)
    local b = tonumber(hex:sub(6, 7), 16)

    return {r = r, g = g, b = b}
end

local function cellColorToValues(cell)
    local outColor
    if cell.attr.gfx_glow_color then
        outColor = glowColorToValues(cell)
    elseif cell.attr.wang_color then
        outColor = wangColorToValues(cell)
    else
        return nil
    end

    -- materials.xml stores glow colors in a reduced brightness range, so we saturate it to the full range
    -- local brightnessAdjust = (tonumber(cell.attr.gfx_glow) / 255) * 4

    return outColor
end



-- Marking gas is not possible due to color randomisation
local MaterialType = {
    ROCK_SOIL = 0,
    BRICK = 1,
    SAND = 2,
    LIQUID = 3,
    METAL = 4,
    GLASS_ICE_CRYSTAL = 5,

    EMITTER_LIQUID = 14,
    EMITTER_SOLID = 15
}

local function isLiquid(cell)
    return cell.attr.cell_type == "liquid" and
        (cell.attr.liquid_sand or "0" == "0") and
        (cell.attr.liquid_static or "0" == "0") and
        (cell.attr.is_just_particle_fx or "0" == "0")
end

local function isMetal(cell)
    if string.match(cell.attr.audio_physics_material_wall or "", "metal") ~= nil or
       string.match(cell.attr.audio_physics_material_solid or "", "metal") ~= nil or
       string.match(cell.attr.audio_physics_material_event or "", "metal") ~= nil then
        return true
    end
    return false
end

local function isGlassOrIceOrCrystal(cell)
    if string.match(cell.attr.audio_physics_material_wall or "", "ice") ~= nil or
       string.match(cell.attr.audio_physics_material_wall or "", "glass") ~= nil or
       string.match(cell.attr.audio_physics_material_solid or "", "ice") ~= nil or
       string.match(cell.attr.audio_physics_material_solid or "", "glass") ~= nil then
        return true
    end
    return false
end

local function isSand(cell)
    if cell.attr.tags then
        for tag in cell.attr.tags:gmatch("%[(.-)%]") do
            if tag == "sand_ground" or tag == "sand_metal" or tag == "sand_other" then
                return true
            end
        end
    end
    return false
end

local function isRock(cell)
    if cell.attr.tags then
        for tag in cell.attr.tags:gmatch("%[(.-)%]") do
            if tag == "earth" then
                return true
            end
        end
    end
    return false
end

local function determineMaterialType(cell)
    if not cell then return MaterialType.GLASS_ICE_CRYSTAL end

    if isMetal(cell) then
        -- print((cell.attr.name or '???') .. '\tMetal')
        return MaterialType.METAL
    end
    if isGlassOrIceOrCrystal(cell) then
        -- print((cell.attr.name or '???') .. '\tGlass/Ice/Crystal')
        return MaterialType.GLASS_ICE_CRYSTAL
    end
    if isSand(cell) then
        -- print((cell.attr.name or '???') .. '\tSand')
        return MaterialType.SAND
    end
    if isLiquid(cell) then
        -- print((cell.attr.name or '???') .. '\tLiquid')
        return MaterialType.LIQUID
    end
    if isRock(cell) then
        -- print((cell.attr.name or '???') .. '\tRock/Soil')
        return MaterialType.ROCK_SOIL
    end

    return nil
end


local function logPatchedMaterial(cell)
    if not cell.attr.rtx_patched then
        return
    end
    -- print("Patched material " .. (cell.attr.name or "unnamed") .. " with color " .. (cell.attr.gfx_glow_color or "none"))
end

-- TODO: Place these in a user editable file
local MATERIAL_OVERRIDES = {
    ["glowstone"] = {
        ["color"] = { r = 3, g = 12, b = 15 }
    },
    ["glowstone_altar"] = {
        ["color"] = { r = 3, g = 12, b = 15 }
    },
    ["glowstone_potion"] = {
        ["color"] = { r = 6, g = 15, b = 10 }
    },
    ["rock_static_radioactive"] = {
        ["color"] = { r = 4, g = 15, b = 0 }
    }
}

local function processMaterial(cell, material)
    local has_glow = cell.attr.gfx_glow or "0" ~= "0"
    local has_glow_color = cell.attr.gfx_glow_color ~= nil
    local has_tags = cell.attr.tags ~= nil
    local has_wang_color = cell.attr.wang_color ~= nil
    local has_texture = false
    local is_gas = cell.attr.cell_type == "gas"

    -- Apply overrides if available
    if cell.attr.name and MATERIAL_OVERRIDES[cell.attr.name] then
        local override = MATERIAL_OVERRIDES[cell.attr.name]
        cell.attr.gfx_glow_color = colorToHex(override.color)
        cell.attr.gfx_glow = "1023"
        return
    end

    if has_glow and is_gas then
        -- Engine randomises gas glow colors, we can't use it
        return
    end

    for child in cell:each_of("Graphics") do
        if not child.attr then
            break
        end
        -- If the parent or child has glow
        if has_glow or (child.attr.gfx_glow or "0" ~= "0") then
            -- And it has a valid texture file
            if child.attr.texture_file ~= nil and child.attr.texture_file ~= "" and ModImageDoesExist(child.attr.texture_file) then
                -- Skip processing and allow texture to be used as glow color
            return
            end
        end
        -- if has_glow and child.attr.normal_mapped or "0" ~= "0" then
        --     child.attr.normal_mapped = "0"
        -- end
    end

    -- if isOccluder(cell) then
    --     outColor = { r = 255, g = 255, b = 255 }
    --     cell.attr.gfx_glow = "255"
    --     cell.attr.gfx_glow_color = colorToHex(outColor)
    --     cell.attr.rtx_patched = "1"
    --     return
    -- end

    local outColor = { r = 0, g = 0, b = 0 }
    local dataBits = { r = 0, g = 0, b = 0 }

    -- if (has_glow and has_texture) then
    --     -- We can't control the color of the texture, but we can restrict the max brightness to only use the
    --     -- low 4 bits of each channel, wich we can then use to differentiate texture glow from color glow
    --     -- Unfortunately, this means we can't attach material properties to these materials
    --     cell.attr.gfx_glow = math.min(63, tonumber(cell.attr.gfx_glow) or 0)
    --     cell.attr.rtx_patched = "1"
    --     return
    -- end

    if has_glow then
        outColor = cellColorToValues(cell)

        if not outColor then
            warn("Material " .. (cell.attr.name or "unknown") .. " has invalid glow color. Skipping.")
            return
        end

        -- Crush down to 4 bits per channel. This is all the room we can spare in our buffer and is good enough
        outColor = {
            r = math.min(15, outColor.r / 16),
            g = math.min(15, outColor.g / 16),
            b = math.min(15, outColor.b / 16)
        }

        -- Emitter (Solid)
        if material == MaterialType.BRICK or
           material == MaterialType.ROCK_SOIL or
           material == MaterialType.SAND or
           material == MaterialType.METAL or
           material == MaterialType.GLASS_ICE_CRYSTAL then
            material = MaterialType.EMITTER_SOLID
        end

        -- Emitter (Liquid)
        if material == MaterialType.LIQUID then
            material = MaterialType.EMITTER_LIQUID
        end

        cell.attr.gfx_glow = "1023"
    else
        -- Not a glowing material
        if is_gas then
            -- Engine randomises gas glow colors, we can't use it
            cell.attr.gfx_glow = "0"
            cell.attr.gfx_glow_color = "00000000"
            return
        else
            -- Set a glow color to encode material type
            outColor.r = outColor.r + 128
            outColor.g = outColor.g + 128
            outColor.b = outColor.b + 128
        end
    end

    -- Exact value rendered to glow texture
    print("Patched material " .. (cell.attr.name or "unnamed") .. " with color " .. colorToHex(outColor))
    cell.attr.gfx_glow_color = colorToHex(outColor)
    cell.attr.gfx_glow = "1023"
end

local function patch()
    local materialsXMLString = ModTextFileGetContent("data/materials.xml")
    local materialsXML = nxml.parse(materialsXMLString)

    local baseMaterials = {}

    -- First pass for base materials
    for cellData in materialsXML:each_of("CellData") do
        local name = cellData.attr.name
        local material = determineMaterialType(cellData) or MaterialType.ROCK_SOIL

        if name and not baseMaterials[name] then
            baseMaterials[name] = material
        end

        processMaterial(cellData, material)
        logPatchedMaterial(cellData)
    end

    for cellDataChild in materialsXML:each_of("CellDataChild") do
        local parentName = cellDataChild.attr._parent

        local material = determineMaterialType(cellDataChild) or baseMaterials[parentName] or MaterialType.ROCK_SOIL

        processMaterial(cellDataChild, material)
        logPatchedMaterial(cellDataChild)
    end

    materialsXMLString = tostring(materialsXML)
    ModTextFileSetContent("data/materials.xml", materialsXMLString)
    print("Materials Processed")
end

return {
    patch = patch
}
