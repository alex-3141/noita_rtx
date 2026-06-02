-- Add script directory to package.path to find local modules
local script_path = arg[0]
local script_dir = script_path:match("(.*[/\\])")
if script_dir then
    package.path = script_dir .. "?.lua;" .. package.path
end

if #arg < 1 then
    print("Usage: luajit generate_patches.lua <file1> [output]")
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

local content = read_file(arg[1])

-- Recognized patch commands
local COMMANDS = {
    REPLACE       = true,
    INSERT_AFTER  = true,
    INSERT_BEFORE = true,
    DELETE        = true,
}

-- States: "scanning", "op_search", "op_content"
--
-- All patch blocks share the same structure:
--   // <CMD> [shorthand_anchor]  <- shorthand: anchor on same line, go to op_content
--   // <CMD>                      <- multi-line: go to op_search
--   // <anchor line>             <- (op_search) // -prefixed search/anchor lines
--   // START                     <- (op_search) switch to op_content
--   <content lines>              <- verbatim lines to insert/replace with
--   // END                       <- ends the block (// END in op_search is valid, e.g. DELETE)

local state = "scanning"
local current_cmd = nil
local search_lines = {}
local content_lines = {}
local operations = {}

local function emit_op()
    table.insert(operations, {
        cmd     = current_cmd,
        search  = table.concat(search_lines, "\r\n"),
        content = table.concat(content_lines, "\r\n"),
    })
    current_cmd = nil
    search_lines = {}
    content_lines = {}
end

for line in (content .. "\r\n"):gmatch("(.-)\r\n") do

    if state == "scanning" then
        local cmd, rest = line:match("^// ([%u_]+)%s*(.-)%s*$")
        if cmd and COMMANDS[cmd] then
            current_cmd = cmd
            content_lines = {}
            if rest ~= "" then
                search_lines = { rest }
                state = "op_content"
            else
                search_lines = {}
                state = "op_search"
            end
        end

    elseif state == "op_search" then
        if line == "// START" then
            state = "op_content"
        elseif line == "// END" then
            emit_op()
            state = "scanning"
        elseif line:sub(1, 3) == "// " then
            table.insert(search_lines, line:sub(4))
        elseif line == "//" then
            table.insert(search_lines, "")
        end

    elseif state == "op_content" then
        if line == "// END" then
            emit_op()
            state = "scanning"
        else
            table.insert(content_lines, line)
        end
    end
end

-- Code generation
-- All search strings use plain (literal) matching via string.find(..., 1, true).
local codegen = {
    REPLACE = function(op)
        return string.format("content = replace(content, %q, %q)", op.search, op.content)
    end,
    INSERT_AFTER = function(op)
        return string.format("content = insert_after(content, %q, %q)", op.search, op.content)
    end,
    INSERT_BEFORE = function(op)
        return string.format("content = insert_before(content, %q, %q)", op.search, op.content)
    end,
    DELETE = function(op)
        return string.format("content = delete(content, %q)", op.search)
    end,
}

local lines = {}
for _, op in ipairs(operations) do
    local gen = codegen[op.cmd]
    if gen then
        table.insert(lines, gen(op))
    else
        io.stderr:write("Warning: unknown command '" .. op.cmd .. "'\n")
    end
end


local patch_ops = read_file("lib/patch_ops.lua")

local generated_code = table.concat({
    patch_ops,
    "return {apply = function(content)",
    table.concat(lines, "\n"),
    "return content end}",
}, "\n")

if arg[2] then
    local out = io.open(arg[2], "w")
    if not out then
        io.stderr:write("Error: could not open output file " .. arg[2] .. "\n")
        os.exit(1)
    end
    out:write(generated_code)
    out:close()
else
    print(generated_code)
end
