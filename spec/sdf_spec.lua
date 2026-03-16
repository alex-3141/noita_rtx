describe("SDF Module", function()
    local sdf = dofile("files/sdf.lua")

    describe("generate_signed_distance_field", function()
        it("should create a valid SDF from a binary map", function()
            local binary_map = {
                { false, false, false, false, false },
                { false, false, false, false, false },
                { false, false,  true,  true,  true },
                { false, false,  true,  true,  true },
                { false, false,  true,  true,  true },
            }

            local result = sdf.generate_signed_distance_field(binary_map)

            assert.is_table(result)
            assert.equals(5, #result)
            assert.equals(5, #result[1])

            local expected = {
                {  8,  5,   4,   4,   4 },
                {  5,  2,   1,   1,   1 },
                {  4,  1,  -1,  -1,  -1 },
                {  4,  1,  -1,  -4,  -4 },
                {  4,  1,  -1,  -4,  -9 },
            }

            assert.same(expected, result)
        end)
    end)
end)
