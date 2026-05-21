local has_bit, bit = pcall(require, "bit")
if not has_bit then
    io.stderr:write("Error: lua 'bit' library not found.\n")
    os.exit(1)
end
bit32 = bit

-- Add script directory to package.path to find local modules
local script_path = arg[0]
local script_dir = script_path:match("(.*[/\\])")
if script_dir then
    package.path = script_dir .. "?.lua;" .. package.path
end

local diff = require("diff_match_patch")

if #arg < 2 then
    print("Usage: lua script.lua <file1> <file2> [output]")
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

local text1 = read_file(arg[1])
local text2 = read_file(arg[2])

-- Maximize diff granularity:
diff.settings({
    Diff_Timeout = 0,
    Diff_EditCost = 1,
})

local diffs = diff.diff_main(text1, text2, false)
patches = diff.patch_make(text1, diffs)

cumulative_patches = ""

for _, v in ipairs(patches) do
    cumulative_patches = cumulative_patches .. tostring(v)
end

if arg[3] then
    local out = io.open(arg[3], "w")
    if not out then
        io.stderr:write("Error: could not open output file " .. arg[3] .. "\n")
        os.exit(1)
    end
    out:write(cumulative_patches)
    out:close()
else
    print(cumulative_patches)
end
