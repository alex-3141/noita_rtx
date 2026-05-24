-- Upgrade other mod's code to work with version 400
local upgrade = function(shadercode)
    -- Replace `gl_FragColor' with 'outColor'
    shadercode = shadercode:gsub("gl_FragColor", "outColor")

    -- Replace gl_TexCoord[0] with tex_coord_
    shadercode = shadercode:gsub("gl_TexCoord%[0%]", "tex_coord_")
    return shadercode
end

local script_path = arg[0]
local script_dir = script_path:match("(.*[/\\])")
if script_dir then
    package.path = script_dir .. "?.lua;" .. package.path
end

if #arg < 2 then
    print("Usage: luajit apply_patches.lua <original> <patches> [output]")
    os.exit(1)
end

local function read_file(path)
    local file, err = io.open(path, "r")
    if not file then
        io.stderr:write("Error opening file '" .. path .. "': " .. tostring(err))
        os.exit(1)
    end
    local content = file:read("*all")
    file:close()
    return content
end

local shadercode = read_file(arg[1])
local patch = dofile(arg[2])
local output = arg[3] or nil

local shadercode = upgrade(shadercode)
local patched_shadercode = patch.apply(shadercode)

if output then
    local file, err = io.open(output, "w")
    if not file then
        io.stderr:write("Error opening output file '" .. output .. "': " .. tostring(err))
        os.exit(1)
    end
    file:write(patched_shadercode)
    file:close()
else
    io.write(patched_shadercode)
end

