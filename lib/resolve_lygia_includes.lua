if #arg < 1 then
    print("Usage: lua lygia_include.lua <input> [output]")
    os.exit(1)
end

local included = {}

local function resolve_includes(path)
    if included[path] then
        return ""
    end
    included[path] = true

    local file = io.open(path, "r")
    if not file then
        io.stderr:write("Error: could not find " .. path .. "\n")
        os.exit(1)
    end
    local content = file:read("*all")
    file:close()

    local dir = path:match("(.*[/\\])") or ""

    return (content:gsub('#include%s+"([^"]+)"', function(inc_path)
        return resolve_includes(dir .. inc_path)
    end))
end

local code = resolve_includes(arg[1])

if arg[2] then
    local out = io.open(arg[2], "w")
    if not out then
        io.stderr:write("Error: could not open output file " .. arg[2] .. "\n")
        os.exit(1)
    end
    out:write(code)
    out:close()
else
    print(code)
end
