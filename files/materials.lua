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

local function logPatchedMaterial(cell)
    print("Patched material " .. (cell.attr.name or "unnamed"))
end

-- TODO: Place these in a user editable file
local ADJUSTMENTS = {
    ["glowstone"] = {
        ["gfx_glow"] = "127"
    },
    ["glowstone_altar"] = {
        ["gfx_glow"] = "127"
    },
    ["glowstone_potion"] = {
        ["gfx_glow"] = "127"
    },
}

-- Some glowing materials cannot be modified with gfx_glow, such as gold and fire.
-- The colors of these are always be in the range 0-63, or 6 bits.
-- We normalize all other glow sources to 6 bits to match, so that everything is within the same range
-- The color written to the glow texture is first multiplied by gfx_glow / 1023.
-- Some materials that use textures or are gasses cannot have their colors changed exactly.
-- Therefore, we set gfx_glow to 255 to push textures and gasses into the 0-63 range, and manually set the other materials
-- For occluders, we set bit 7 to true to mark it as a non-color occluder. This leaves us with an extra bit for later.
-- These colors are then crushed to 4 bits in the shader before being used for lighting
-- Note: Liquids, fire and superbright particles will have special alpha values in the texture that we can't modify.

local function processMaterial(cell)
    local name = cell.attr.name

    -- Apply adjustments if available
    if name and ADJUSTMENTS[name] then
        local adjustments = ADJUSTMENTS[name]
        if adjustments.gfx_glow_color then
            cell.attr.gfx_glow_color = adjustments.gfx_glow_color
        end
        if adjustments.gfx_glow then
            cell.attr.gfx_glow = adjustments.gfx_glow
        end
    end

    local has_glow = (cell.attr.gfx_glow or "0") ~= "0"
    local is_gas = cell.attr.cell_type == "gas"

    if has_glow then
        -- Clamp brightnesses to 255 and thus the 0-63 range. A few materials go above 255 and will be reduced.
        -- There is a free bit available, if the material color can be modified then some kind of
        -- tonemapping may be possible to preserve these highly bright materials
        cell.attr.gfx_glow = string.format("%d", math.min(255, tonumber(cell.attr.gfx_glow)))
    end

    if is_gas then
        -- Can't modify gasses
    elseif has_glow then
        -- Textured materials need gfx_glow_color to be zeroed, otherwise they will use the glow color of the parent material
        for child in cell:each_of("Graphics") do
            if child.attr.texture_file == ""  or child.attr.texture_file ~= nil then
                cell.attr.gfx_glow_color = "00000000"
            end
        end
    else
        -- Occluder - Set opaque bit
        -- Note: We could include the full color or other information in the lower 6 bits.
        --       This may be useful for something in the future.
        cell.attr.gfx_glow_color = colorToHex( { r = 64, g = 64, b = 64 })
        cell.attr.gfx_glow = "1023"
    end
end

local function patch()
    local materialsXMLString = ModTextFileGetContent("data/materials.xml")
    local materialsXML = nxml.parse(materialsXMLString)

    -- Base materials
    for cellData in materialsXML:each_of("CellData") do
        processMaterial(cellData)
        logPatchedMaterial(cellData)
    end

    -- Child materials
    for cellDataChild in materialsXML:each_of("CellDataChild") do
        processMaterial(cellDataChild)
        logPatchedMaterial(cellDataChild)
    end

    materialsXMLString = tostring(materialsXML)
    ModTextFileSetContent("data/materials.xml", materialsXMLString)
    print("Materials Processed")
end

return {
    patch = patch
}
