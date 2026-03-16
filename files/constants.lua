VIRTUAL_RESOLUTION_X = MagicNumbersGetValue("VIRTUAL_RESOLUTION_X")
VIRTUAL_RESOLUTION_Y = MagicNumbersGetValue("VIRTUAL_RESOLUTION_Y")
VIEWPORT_SCALE = 1 / math.min(VIRTUAL_RESOLUTION_X / 427, VIRTUAL_RESOLUTION_Y / 242)
RESOLUTION_X, RESOLUTION_Y = GuiGetScreenDimensions(GuiCreate())
ASPECT = RESOLUTION_X / RESOLUTION_Y
-- BUCKET_PIXELS = 24
-- BUCKET_WIDTH = 53 
-- BUCKET_WIDTH_PIXELS = 53 * BUCKET_PIXELS
-- BUCKET_HEIGHT = 30
-- DF_WIDTH = 96
-- DF_HEIGHT = 48
-- DF_MEGAPIXEL_SIZE = 1
-- DF_RESOLUTION = 16
GameGetCameraPos = GameGetCameraPos
GameSetPostFxParameter = GameSetPostFxParameter


-- Not so constants
Player = nil
LIGHT_TEXTURE = nil
LIGHT_LIST_TEXTURE = nil
DISTANCE_FIELD_TEXTURE = nil

pixel_size = 8
FALLOFF_CLEAR = 0.0005
FALLOFF_OCCLUDER = 0.03
LUMINOSITY_THRESHOLD = 0.01
GLOBAL_LIGHT_COUNT = 32

-- border_size = 8
border_size = 0
frame_width = 430 / pixel_size
frame_height = 242 / pixel_size

DF_WIDTH = math.floor(frame_width + border_size * 2)
DF_HEIGHT = math.floor(frame_height + border_size * 2)


local GAMMA = 2.2
local INV_GAMMA = 1.0 / GAMMA

--- Converts RGB color values from sRGB space to linear space.
-- @param r Red component (0.0 to 1.0)
-- @param g Green component (0.0 to 1.0)
-- @param b Blue component (0.0 to 1.0)
-- @return Linear red, green, and blue components.
function srgb_to_linear(r, g, b)
    local linear_r = math.pow(r, GAMMA)
    local linear_g = math.pow(g, GAMMA)
    local linear_b = math.pow(b, GAMMA)
    return linear_r, linear_g, linear_b
end

--- Converts RGB color values from linear space to sRGB space.
-- @param r Linear red component (0.0 to 1.0+)
-- @param g Linear green component (0.0 to 1.0+)
-- @param b Linear blue component (0.0 to 1.0+)
-- @return sRGB red, green, and blue components (clamped 0.0 to 1.0).
function linear_to_srgb(r, g, b)
    -- Clamp linear values before conversion to avoid issues with negative numbers if they occur
    local srgb_r = math.pow(math.max(0.0, r), INV_GAMMA)
    local srgb_g = math.pow(math.max(0.0, g), INV_GAMMA)
    local srgb_b = math.pow(math.max(0.0, b), INV_GAMMA)
    -- Clamp final result to [0, 1] range typical for sRGB
    return math.min(1.0, srgb_r), math.min(1.0, srgb_g), math.min(1.0, srgb_b)
end

function luminosity(r, g, b)
    return math.sqrt(0.299 * (r * r) + 0.587 * (g * g) + 0.114 * (b * b))
end

function luminosity_srgb(r, g, b)
    local linear_r, linear_g, linear_b = srgb_to_linear(r, g, b)
    return math.sqrt(0.299 * (linear_r * linear_r) + 0.587 * (linear_g * linear_g) + 0.114 * (linear_b * linear_b))
end