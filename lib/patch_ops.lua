local function escape_lua_pattern(text)
    return (text:gsub("([%^%$%(%)%%%.%[%]%*%+%-%?])", "%%%1"))
end

local function trim(text)
    return (text:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function target_to_fuzzy_pattern(target)
    local normalized = target:gsub("\r\n", "\n"):gsub("\r", "\n")
    local lines = {}

    for line in (normalized .. "\n"):gmatch("(.-)\n") do
        local normalized_line = trim(line)
        if normalized_line ~= "" then
            table.insert(lines, "[ \t]*" .. escape_lua_pattern(normalized_line) .. "[ \t]*")
        end
    end

    if #lines == 0 then
        return nil
    end

    local line_separator_pattern = "[ \t]*[\r\n]+[ \t\r\n]*"
    return table.concat(lines, line_separator_pattern)
end

local function replace(content, target, replacement)
    local target_pattern = target_to_fuzzy_pattern(target)
    local _i, _j
    if target_pattern then
        _i, _j = content:find(target_pattern, 1)
    end
    if _i then
        content = content:sub(1, _i - 1) .. replacement .. content:sub(_j + 1)
    else
        print(string.format("[Noita RTX] Failed to replace target text.\nTarget: %q\n\nReplacement: %q", target, replacement))
    end
    return content
end

local function insert_after(content, target, replacement)
    local target_pattern = target_to_fuzzy_pattern(target)
    local _i, _j
    if target_pattern then
        _i, _j = content:find(target_pattern, 1)
    end
    if _i then
        content = content:sub(1, _j) .. "\r\n" .. replacement .. content:sub(_j + 1)
    else
        print(string.format("[Noita RTX] Failed to insert after target text.\nTarget: %q\n\nReplacement: %q", target, replacement))
    end
    return content
end


local function insert_before(content, target, replacement)
    local target_pattern = target_to_fuzzy_pattern(target)
    local _i, _j
    if target_pattern then
        _i, _j = content:find(target_pattern, 1)
    end
    if _i then
        content = content:sub(1, _i - 1) .. replacement .. "\r\n" .. content:sub(_i)
    else
        print(string.format("[Noita RTX] Failed to insert before target text.\nTarget: %q\n\nReplacement: %q", target, replacement))
    end
    return content
end

local function delete(content, target)
    local target_pattern = target_to_fuzzy_pattern(target)
    local _i, _j
    if target_pattern then
        _i, _j = content:find(target_pattern, 1)
    end
    if _i then
        content = content:sub(1, _i - 1) .. content:sub(_j + 1)
    else
        print(string.format("[Noita RTX] Failed to delete target text.\nTarget: %q", target))
    end
    return content
end