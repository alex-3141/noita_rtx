#version 450 core
#define DITHER
#define HIQ














// Lygia includes ========================================================================================
// =======================================================================================================

// These will eventually be injected during mod init

#ifndef SAMPLER_FNC
#if __VERSION__ >= 300
#define SAMPLER_FNC(TEX, UV) texture(TEX, UV)
#else
#define SAMPLER_FNC(TEX, UV) texture2D(TEX, UV)
#endif
#endif

#ifndef SAMPLER_TYPE
#define SAMPLER_TYPE sampler2D
#endif


#ifndef FNC_POW3
#define FNC_POW3

float pow3(const in float v) { return v * v * v; }
vec2 pow3(const in vec2 v) { return v * v * v; }
vec3 pow3(const in vec3 v) { return v * v * v; }
vec4 pow3(const in vec4 v) { return v * v * v; }

#endif


#ifndef SAMPLE_CHANNEL
#define SAMPLE_CHANNEL 0
#endif

vec3 normalFromHeightMap(SAMPLER_TYPE heightMap, vec2 st, float strength, float offset)
{
    offset = pow3(offset) * 0.1;

    float p = SAMPLER_FNC(heightMap, st)[SAMPLE_CHANNEL];
    float h = SAMPLER_FNC(heightMap, st + vec2(offset, 0.0))[SAMPLE_CHANNEL];
    float v = SAMPLER_FNC(heightMap, st + vec2(0.0, offset))[SAMPLE_CHANNEL];

    vec3 a = vec3(1, 0, (h - p) * strength);
    vec3 b = vec3(0, 1, (v - p) * strength);

    return normalize(cross(a, b));
}

vec3 normalFromHeightMap(SAMPLER_TYPE heightMap, vec2 st, float strength)
{
    return normalFromHeightMap(heightMap, st, strength, 0.5);

}



#ifndef FNC_LUMINANCE
#define FNC_LUMINANCE
float luminance(in vec3 linear) { return dot(linear, vec3(0.21250175, 0.71537574, 0.07212251)); }
float luminance(in vec4 linear) { return luminance( linear.rgb ); }
#endif


#ifndef SRGB_EPSILON 
#define SRGB_EPSILON 1e-10
#endif

#if !defined(FNC_SATURATE) && !defined(saturate)
#define FNC_SATURATE
#define saturate(V) clamp(V, 0.0, 1.0)
#endif

#ifndef FNC_RGB2SRGB
#define FNC_RGB2SRGB
float rgb2srgb(const in float c) {   return (c < 0.0031308) ? c * 12.92 : 1.055 * pow(c, 0.4166666666666667) - 0.055; }
vec3  rgb2srgb(const in vec3 rgb) {  return saturate(vec3(  rgb2srgb(rgb.r - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.g - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.b - SRGB_EPSILON))); }
vec4  rgb2srgb(const in vec4 rgb) {  return vec4(rgb2srgb(rgb.rgb), rgb.a); }
#endif

#ifndef SRGB_EPSILON 
#define SRGB_EPSILON 1e-10
#endif

#ifndef FNC_SRGB2RGB
#define FNC_SRGB2RGB
// 1.0 / 12.92 = 0.0773993808
// 1.0 / (1.0 + 0.055) = 0.947867298578199
float srgb2rgb(const in float v) {   return (v < 0.04045) ? v * 0.0773993808 : pow((v + 0.055) * 0.947867298578199, 2.4); }
vec3 srgb2rgb(const in vec3 srgb) {  return vec3(   srgb2rgb(srgb.r + SRGB_EPSILON),
                                                    srgb2rgb(srgb.g + SRGB_EPSILON),
                                                    srgb2rgb(srgb.b + SRGB_EPSILON)); }
vec4 srgb2rgb(const in vec4 srgb) {  return vec4(   srgb2rgb(srgb.rgb), srgb.a); }
#endif


#if !defined(FNC_SATURATE) && !defined(saturate)
#define FNC_SATURATE
#define saturate(V) clamp(V, 0.0, 1.0)
#endif// #define SAMPLEUNTILE_FAST


#ifndef FNC_TONEMAPUNREAL
#define FNC_TONEMAPUNREAL
vec3 tonemapUnreal(const vec3 x) { return x / (x + 0.155) * 1.019; }
vec4 tonemapUnreal(const vec4 x) { return vec4(tonemapUnreal(x.rgb), x.a); }
#endif

#ifndef FNC_TONEMAPUNCHARTED2
#define FNC_TONEMAPUNCHARTED2
vec3 tonemapUncharted2(vec3 v) {
    float A = 0.15; // 0.22
    float B = 0.50; // 0.30
    float C = 0.10;
    float D = 0.20;
    float E = 0.02; // 0.01
    float F = 0.30;
    float W = 11.2;

    vec4 x = vec4(v, W);
    x = ((x*(A*x+C*B)+D*E)/(x*(A*x+B)+D*F))-E/F;
    return x.xyz / x.w;
}

vec4 tonemapUncharted2(const vec4 x) { return vec4( tonemapUncharted2(x.rgb), x.a); }
#endif

#ifndef FNC_TONEMAPUNCHARTED
#define FNC_TONEMAPUNCHARTED

vec3 uncharted2Tonemap(const vec3 x) {
    const float A = 0.15;
    const float B = 0.50;
    const float C = 0.10;
    const float D = 0.20;
    const float E = 0.02;
    const float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 tonemapUncharted(const vec3 x) {
    const float W = 11.2;
    const float exposureBias = 2.0;
    vec3 curr = uncharted2Tonemap(exposureBias * x);
    vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
    return curr * whiteScale;
}

vec4 tonemapUncharted(const vec4 x) { return vec4( tonemapUncharted(x.rgb), x.a); }
#endif

#ifndef FNC_TONEMAPREINHARDJODIE
#define FNC_TONEMAPREINHARDJODIE
vec3 tonemapReinhardJodie(const vec3 x) { 
    float l = dot(x, vec3(0.21250175, 0.71537574, 0.07212251));
    vec3 tc = x / (x + 1.0);
    return mix(x / (l + 1.0), tc, tc); 
}
vec4 tonemapReinhardJodie(const vec4 x) { return vec4( tonemapReinhardJodie(x.rgb), x.a ); }
#endif

#ifndef FNC_TONEMAPREINHARD
#define FNC_TONEMAPREINHARD
vec3 tonemapReinhard(const vec3 v) { return v / (1.0 + dot(v, vec3(0.21250175, 0.71537574, 0.07212251))); }
vec4 tonemapReinhard(const vec4 v) { return vec4( tonemapReinhard(v.rgb), v.a ); }
#endif

#ifndef FNC_TONEMAPLINEAR
#define FNC_TONEMAPLINEAR
vec3 tonemapLinear(const vec3 v) { return v; }
vec4 tonemapLinear(const vec4 v) { return v; }
#endif

#ifndef FNC_TONEMAPFILMIC
#define FNC_TONEMAPFILMIC
vec3 tonemapFilmic(vec3 v) {
    v = max(vec3(0.0), v - 0.004);
    v = (v * (6.2 * v + 0.5)) / (v * (6.2 * v + 1.7) + 0.06);
    return v;
}

vec4 tonemapFilmic(const vec4 x) { return vec4( tonemapFilmic(x.rgb), x.a ); }
#endif

#ifndef FNC_TONEMAPDEBUG
#define FNC_TONEMAPDEBUG

#if !defined(PLATFORM_RPI) && !defined(PLATFORM_WEBGL)
vec3 tonemapDebug(const vec3 x) {

    // 16 debug colors + 1 duplicated at the end for easy indexing
    vec3 debugColors[17];
    debugColors[0] = vec3(0.0, 0.0, 0.0);         // black
    debugColors[1] = vec3(0.0, 0.0, 0.1647);      // darkest blue
    debugColors[2] = vec3(0.0, 0.0, 0.3647);      // darker blue
    debugColors[3] = vec3(0.0, 0.0, 0.6647);      // dark blue
    debugColors[4] = vec3(0.0, 0.0, 0.9647);      // blue
    debugColors[5] = vec3(0.0, 0.9255, 0.9255);   // cyan
    debugColors[6] = vec3(0.0, 0.5647, 0.0);      // dark green
    debugColors[7] = vec3(0.0, 0.7843, 0.0);      // green
    debugColors[8] = vec3(1.0, 1.0, 0.0);         // yellow
    debugColors[9] = vec3(0.90588, 0.75294, 0.0); // yellow-orange
    debugColors[10] = vec3(1.0, 0.5647, 0.0);      // orange
    debugColors[11] = vec3(1.0, 0.0, 0.0);         // bright red
    debugColors[12] = vec3(0.8392, 0.0, 0.0);      // red
    debugColors[13] = vec3(1.0, 0.0, 1.0);         // magenta
    debugColors[14] = vec3(0.6, 0.3333, 0.7882);   // purple
    debugColors[15] = vec3(1.0, 1.0, 1.0);         // white
    debugColors[16] = vec3(1.0, 1.0, 1.0);         // white

    // The 5th color in the array (cyan) represents middle gray (18%)
    // Every stop above or below middle gray causes a color shift
    float l = dot(x, vec3(0.21250175, 0.71537574, 0.07212251));
    float v = log2(l / 0.18);
    v = clamp(v + 5.0, 0.0, 15.0);
    int index = int(v);
    return mix(debugColors[index], debugColors[index + 1], v - float(index));
}
vec4 tonemapDebug(const vec4 x) { return vec4(tonemapDebug(x.rgb), x.a); }
#endif

#endif

#ifndef FNC_TONEMAPACES
#define FNC_TONEMAPACES
vec3 tonemapACES(vec3 v) {
    const float a = 2.51;
    const float b = 0.03;
    const float c = 2.43;
    const float d = 0.59;
    const float e = 0.14;
    return saturate((v*(a*v+b))/(v*(c*v+d)+e));
}

vec4 tonemapACES(in vec4 v) {
    return vec4(tonemapACES(v.rgb), v.a);
}
#endif


#ifndef TONEMAP_FNC
#if defined(TARGET_MOBILE) || defined(PLATFORM_RPI)
    #define TONEMAP_FNC     tonemapUnreal
#else
//     #define TONEMAP_FNC     tonemapDebug
//     #define TONEMAP_FNC     tonemapFilmic
//     #define TONEMAP_FNC     tonemapACES
//     #define TONEMAP_FNC     tonemapUncharted2
    #define TONEMAP_FNC     tonemapUncharted
//     #define TONEMAP_FNC     tonemapReinhardJodie
//     #define TONEMAP_FNC     tonemapReinhard
//     #define TONEMAP_FNC     tonemapUnreal
//     #define TONEMAP_FNC     tonemapLinear
#endif
#endif

#ifndef FNC_TONEMAP
#define FNC_TONEMAP

vec3 tonemap(const vec3 v) { return TONEMAP_FNC(v); }
vec4 tonemap(const vec4 v) { return TONEMAP_FNC(v); }

#endif

#ifndef DIGITS_SIZE
#define DIGITS_SIZE vec2(.02)
#endif

#ifndef DIGITS_DECIMALS
#define DIGITS_DECIMALS 2.0
#endif

#ifndef DIGITS_VALUE_OFFSET
#define DIGITS_VALUE_OFFSET vec2(-6.0, 3.0) 
#endif

#ifndef FNC_DIGITS
#define FNC_DIGITS
float digits(in vec2 st, in float value, in float nDecDigit) {
    st /= DIGITS_SIZE;

    float absValue = abs(value);
    float biggestDigitIndex = max(floor(log2(absValue) / log2(10.)), 0.);
    float counter = floor(absValue);
    float nIntDigits = 1.;
    for (int i = 0; i < 9; i++) {
        counter = floor(counter*.1);
        nIntDigits++;
        if (counter == 0.)
            break;
    }

    float digit = 12.;
    float digitIndex = (nIntDigits-1.) - floor(st.x);
    if (digitIndex > (-nDecDigit - 1.5)) {
        if (digitIndex > biggestDigitIndex) {
            if (value < 0.) {
                if (digitIndex < (biggestDigitIndex+1.5)) {
                    digit = 11.;
                }
            }
        } 
        else {
            if (digitIndex == -1.) {
                if (nDecDigit > 0.) {
                    digit = 10.;
                }
            } 
            else {
                if (digitIndex < 0.) {
                    digitIndex += 1.;
                }
                float digitValue = (absValue / (pow(10., digitIndex)));
                digit = mod(floor(0.0001+digitValue), 10.);
            }
        }
    }
    vec2 pos = vec2(fract(st.x), st.y);

    if (pos.x < 0.) return 0.;
    if (pos.y < 0.) return 0.;
    if (pos.x >= 1.) return 0.;
    if (pos.y >= 1.) return 0.;

    // make a 4x5 array of bits
    float bin = 0.;
    if (digit < 0.5) // 0
        bin = 7. + 5. * 16. + 5. * 256. + 5. * 4096. + 7. * 65536.;
    else if (digit < 1.5) // 1
        bin = 2. + 2. * 16. + 2. * 256. + 2. * 4096. + 2. * 65536.;
    else if (digit < 2.5) // 2
        bin = 7. + 1. * 16. + 7. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 3.5) // 3
        bin = 7. + 4. * 16. + 7. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 4.5) // 4
        bin = 4. + 7. * 16. + 5. * 256. + 1. * 4096. + 1. * 65536.;
    else if (digit < 5.5) // 5
        bin = 7. + 4. * 16. + 7. * 256. + 1. * 4096. + 7. * 65536.;
    else if (digit < 6.5) // 6
        bin = 7. + 5. * 16. + 7. * 256. + 1. * 4096. + 7. * 65536.;
    else if (digit < 7.5) // 7
        bin = 4. + 4. * 16. + 4. * 256. + 4. * 4096. + 7. * 65536.;
    else if (digit < 8.5) // 8
        bin = 7. + 5. * 16. + 7. * 256. + 5. * 4096. + 7. * 65536.;
    else if (digit < 9.5) // 9
        bin = 7. + 4. * 16. + 7. * 256. + 5. * 4096. + 7. * 65536.;
    else if (digit < 10.5) // '.'
        bin = 2. + 0. * 16. + 0. * 256. + 0. * 4096. + 0. * 65536.;
    else if (digit < 11.5) // '-'
        bin = 0. + 0. * 16. + 7. * 256. + 0. * 4096. + 0. * 65536.;

    vec2 pixel = floor(pos * vec2(4., 5.));
    return mod(floor(bin / pow(2., (pixel.x + (pixel.y * 4.)))), 2.);
}

float digits(in vec2 st, in float value, in float nDecDigit, in float nIntDigits) {
    vec2 st2 = st;
    float result = 0.0;
    float dig = nDecDigit;

    #ifndef DIGITS_LEADING_INT
    #if defined(PLATFORM_WEBGL)
    #define DIGITS_LEADING_INT 1.0
    #else
    #define DIGITS_LEADING_INT nIntDigits
    #endif
    #endif

    for (float i = DIGITS_LEADING_INT - 1.0; i > 0.0 ; i--) {
        if (i * 10.0 > value) {
            result += digits(st2, 0.0, 0.0);
            st2.x -= DIGITS_SIZE.x;
        }
    }
    result += digits(st2, value, nDecDigit);
    return result; 
}

float digits(in vec2 st, in int value) {
    return digits(st, float(value), 0.0);
}

float digits(in vec2 st, in float value) {
    return digits(st, value, (DIGITS_DECIMALS));
}

float digits(in vec2 st, in vec2 v) {
    float rta = 0.0;
    for (int i = 0; i < 2; i++) {
        vec2 pos = st + vec2(float(i), 0.0) * DIGITS_SIZE * DIGITS_VALUE_OFFSET;
        float value = i == 0 ? v.x : v.y;
        rta += digits( pos, value );
    }
    return rta;
}

float digits(in vec2 st, in vec3 v) {
    float rta = 0.0;
    for (int i = 0; i < 3; i++) {
        vec2 pos = st + vec2(float(i), 0.0) * DIGITS_SIZE * DIGITS_VALUE_OFFSET;
        float value = i == 0 ? v.x : i == 1 ? v.y : v.z;
        rta += digits( pos, value );
    }
    return rta;
}

float digits(in vec2 st, in vec4 v) {
    float rta = 0.0;
    for (int i = 0; i < 4; i++) {
        vec2 pos = st + vec2(float(i), 0.0) * DIGITS_SIZE * DIGITS_VALUE_OFFSET;
        float value = i == 0 ? v.x : i == 1 ? v.y : i == 2 ? v.z : v.w;
        rta += digits( pos, value );
    }
    return rta;
}

float digits(in vec2 st, in mat2 _matrix) {
    float rta = 0.0;
    for (int i = 0; i < 2; i++) {
        for (int j = 0; j < 2; j++) {
            vec2 pos = st + vec2(float(i), float(j)) * DIGITS_SIZE * DIGITS_VALUE_OFFSET - DIGITS_SIZE * vec2(0.0, 3.0);
            float value = _matrix[j][i];
            rta += digits( pos, value );
        }
    }
    return rta;
}

float digits(in vec2 st, in mat3 _matrix) {
    float rta = 0.0;
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            vec2 pos = st + vec2(float(i), float(j)) * DIGITS_SIZE * DIGITS_VALUE_OFFSET - DIGITS_SIZE * vec2(0.0, 6.0);
            float value = _matrix[j][i];
            rta += digits( pos, value );
        }
    }
    return rta;
}

float digits(in vec2 st, in mat4 _matrix) {
    float rta = 0.0;
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4; j++) {
            vec2 pos = st + vec2(float(i), float(j)) * DIGITS_SIZE * DIGITS_VALUE_OFFSET - DIGITS_SIZE * vec2(0.0, 9.0);
            float value = _matrix[j][i];
            rta += digits( pos, value );
        }
    }
    return rta;
}
#endif


const vec3 debugColors[17] = vec3[17](
	vec3(0.0, 0.0, 0.0),         // black 0
	vec3(0.0, 0.0, 0.1647),      // darkest blue 1
	vec3(0.0, 0.0, 0.3647),      // darker blue 2
	vec3(0.0, 0.0, 0.6647),      // dark blue 3 
	vec3(0.0, 0.0, 0.9647),      // blue 4 
	vec3(0.0, 0.9255, 0.9255),   // cyan 5
	vec3(0.0, 0.5647, 0.0),      // dark green 6
	vec3(0.0, 0.7843, 0.0),      // green 7 
	vec3(1.0, 1.0, 0.0),         // yellow 8
	vec3(0.90588, 0.75294, 0.0), // yellow-orange 9
	vec3(1.0, 0.5647, 0.0),      // orange 10
	vec3(1.0, 0.0, 0.0),         // bright red 11
	vec3(0.8392, 0.0, 0.0),      // red 12
	vec3(1.0, 0.0, 1.0),         // magenta 13
	vec3(0.6, 0.3333, 0.7882),   // purple 14
	vec3(1.0, 1.0, 1.0),         // white 15
	vec3(1.0, 1.0, 1.0)         // white 16
);

float exposure(float aperture, float shutterSpeed, float sensitivity) {
    float ev100 = log2((aperture * aperture) / shutterSpeed * 100.0 / sensitivity);
    return 1.0 / (pow(2.0, ev100) * 1.2);
}
#define INV_SQRT_OF_2PI 0.39894228040143267793994605993439  // 1.0/SQRT_OF_2PI
#define INV_PI 0.31830988618379067153776752674503
#define INV_SQRT_TAU 0.39894228040143267793994605993439  // 1.0/SQRT_TAU


// End Lygia includes ====================================================================================
// =======================================================================================================
















uniform vec4 camera_delta;
uniform vec4 player_pos;

//uniform sampler2D tex_prev;
uniform sampler2D tex_bg;
uniform sampler2D tex_fg;
uniform sampler2D tex_lights;
uniform sampler2D tex_skylight;
uniform sampler2D tex_noise;
uniform sampler2D tex_perlin_noise;
uniform sampler2D tex_glow_unfiltered;
uniform sampler2D tex_glow;
uniform sampler2D tex_fog;

uniform float dithering_amount;

uniform vec2 window_size;
uniform vec2 world_viewport_size;
uniform vec2 camera_pos;
uniform float camera_inv_zoom_ratio;

uniform float time;
uniform float night_amount;
uniform vec4 sky_light_color;
uniform float damage_flash_interpolation;
uniform vec4  additive_overlay_color;
uniform vec4  overlay_color;
uniform vec4  overlay_color_blindness;
uniform float low_health_indicator_alpha;

uniform vec4 color_grading;
uniform vec4 brightness_contrast_gamma;

uniform float fog_amount_background;
uniform float fog_amount_foreground;

uniform float drugged_distortion_amount;
uniform float drugged_color_amount;    
uniform float drugged_fractals_amount;
uniform float drugged_fractals_size;
uniform float drugged_nightvision_amount;
uniform float drugged_doublevision_amount;

uniform sampler2D tex_debug;
uniform sampler2D tex_debug2;

in vec2 gggg;
in vec2 subpixel;

in vec2 tex_coord_;
in vec2 tex_coord_y_inverted_;
in vec2 tex_coord_glow_;
in vec2 world_pos;
in vec2 tex_coord_skylight;
in vec2 tex_coord_fogofwar;

out vec4 outColor;









// Noita RTX ========================================================================================
// ==================================================================================================


// COMMON

uniform sampler2D RL_tex_lights;
uniform sampler2D RL_tex_dvd;
uniform sampler2D RL_tex_light_list;
uniform sampler2D RL_tex_df;
uniform vec4 RL_light_count;
uniform vec4 RL_time;
uniform vec4 RL_data;

ivec2 glow_iv = ivec2(tex_coord_glow_ * textureSize(tex_glow, 0));

struct VBuffer {
	vec2 pos;
	vec2 size;
};


// Virtual buffers
// The texture is split into different zones that are used in place of extra shader passes.
const vec2 GLOW_SIZE = vec2(431.0, 242.0);
const vec2 GLOW_BOUNDS = GLOW_SIZE - vec2(1.0);

const vec2 VBUF_SIZE = vec2(106.0, 60.0);
const vec2 VBUF_SIZE_UV = VBUF_SIZE / GLOW_SIZE;
const vec2 VBUF_BOUNDS = VBUF_SIZE - vec2(1.0);
const vec2 VBUF_BOUNDS_UV = VBUF_BOUNDS / GLOW_BOUNDS;

const float HALF_WIDTH = GLOW_SIZE.x / 2.0;

const vec2 HDR_VBUF_SIZE = vec2(HALF_WIDTH, 60.0);
const vec2 HDR_VBUF_SIZE_UV = HDR_VBUF_SIZE / GLOW_SIZE;
const vec2 HDR_VBUF_BOUNDS = HDR_VBUF_SIZE - vec2(1.0);
const vec2 HDR_VBUF_BOUNDS_UV = HDR_VBUF_BOUNDS / GLOW_BOUNDS;

const float COLOR_VBUF_WIDTH = HALF_WIDTH;
const vec2 COLOR_VBUF_SIZE = vec2(COLOR_VBUF_WIDTH, 60.0);
const vec2 COLOR_VBUF_SIZE_UV = COLOR_VBUF_SIZE / GLOW_SIZE;
const vec2 COLOR_VBUF_BOUNDS = COLOR_VBUF_SIZE - vec2(1.0);
const vec2 COLOR_VBUF_BOUNDS_UV = COLOR_VBUF_BOUNDS / GLOW_BOUNDS;


const VBuffer VBUF_COLOR_0 = VBuffer(vec2(0.0, 0.0), COLOR_VBUF_BOUNDS);
const VBuffer VBUF_COLOR_1 = VBuffer(vec2(0.0, COLOR_VBUF_SIZE.y), COLOR_VBUF_BOUNDS);
const VBuffer HDR_VBUF_0 = VBuffer(vec2(HDR_VBUF_SIZE.x, HDR_VBUF_SIZE.y), HDR_VBUF_BOUNDS);
const VBuffer SDF = VBuffer(vec2(0, 120), vec2(430, 121));

struct SDFSample {
	float dist;
	uint material;
};

SDFSample sample_sdf_texel(ivec2 iv) {
	ivec2 offset = ivec2(0);
	if(iv.y < 121){
		offset = ivec2(0, 121);
	}
	ivec2 sample_iv = ivec2(iv) + offset;
	vec3 texel = texelFetch(tex_glow, sample_iv, 0).rgb;

	float dist = 0.0;
	uint material = 0u;
	if(iv.y < 121){
		dist = texel.r;
		material = (uint(texel.b * 255.0) >> 6) & 0x3u;
	} else {
		dist = texel.g;
		material = (uint(texel.b * 255.0) >> 4) & 0x3u;
	}

	return SDFSample(dist, material);
}

// Get the camera delta across 2 frames
vec2 camera_compensation() {
	// Only add offset if game isn't paused to not interfere with screenshots
	// TODO: Find better way to tell if game is paused, this may be used for other things
	if (overlay_color.a < 0.7) {
		return RL_data.xy;
	}

	return vec2(0.0);
}

vec3 sample_hdr_buffer_texel(VBuffer vbuffer, ivec2 iv) {
	// Don't sample outside buffer
	// TODO: May not be needed
	iv = clamp(iv, ivec2(vbuffer.pos), ivec2(vbuffer.pos + vbuffer.size * ivec2(2, 1)));

	vec3 high_sample = texelFetch(tex_glow, iv + ivec2(0, 0), 0).rgb;
	vec3 low_sample  = texelFetch(tex_glow, iv + ivec2(1, 0), 0).rgb;

	uvec3 high_bits = uvec3(high_sample * 255.0) << 8;
	uvec3 low_bits = uvec3(low_sample * 255.0);
	vec3 hdr_color = vec3(high_bits | low_bits) / 255.0;
	return hdr_color;
}

vec3 sample_hdr_buffer(VBuffer vbuffer, vec2 uv) {
	vec2 hdr_uv = uv * vec2(0.5, 1.0);
	ivec2 hdr_iv = ivec2(hdr_uv * vbuffer.size);
	hdr_iv *= ivec2(2, 1);
	hdr_iv += ivec2(vbuffer.pos);

	vec3 hdr_color_ul = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(0, 0));
	vec3 hdr_color_ur = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(2, 0));
	vec3 hdr_color_ll = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(0, 1));
	vec3 hdr_color_lr = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(2, 1));

    // lerp
	vec2 f = fract(hdr_uv * vbuffer.size);
	vec3 hdr_color_top = mix(hdr_color_ul, hdr_color_ur, f.x);
	vec3 hdr_color_bottom = mix(hdr_color_ll, hdr_color_lr, f.x);
	vec3 hdr_color = mix(hdr_color_top, hdr_color_bottom, f.y);

	// return vec3(f, 0.0); // Debug

	return hdr_color;
}

vec3 sample_hdr_buffer_gaussian_3x3(VBuffer vbuffer, vec2 uv) {
	vec2 pixel = 1.0 / (vbuffer.size * vec2(1.0, 2.0));

	vec3 hdr_color = vec3(0.0);
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, -1)) * 0.125;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, 0)) * 0.125;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, 0)) * 0.25;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, 0)) * 0.125;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, 1)) * 0.125;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, 1)) * 0.0625;

	return hdr_color;
}

vec3 sample_hdr_buffer_gaussian_5x5(VBuffer vbuffer, vec2 uv) {
	vec2 pixel = 1.0 / (vbuffer.size * vec2(1.0, 2.0));

	vec3 hdr_color = vec3(0.0);
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-2, -2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, -2)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, -2)) * 0.0234375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, -2)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(2, -2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-2, -1)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, -1)) * 0.09375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(2, -1)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-2, 0)) * 0.0234375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, 0)) * 0.09375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, 0)) * 0.140625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, 0)) * 0.09375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(2, 0)) * 0.0234375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-2, 1)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, 1)) * 0.09375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(2, 1)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-2, 2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(-1, 2)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(0, 2)) * 0.0234375;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(1, 2)) * 0.015625;
	hdr_color += sample_hdr_buffer(vbuffer, uv + pixel * vec2(2, 2)) * 0.00390625;

	return hdr_color;
}

vec3 sample_hdr_buffer_uninterpolated(VBuffer vbuffer, vec2 uv) {
	uv *= vec2(0.5, 1.0);
	ivec2 hdr_iv = ivec2(uv * vbuffer.size);
	hdr_iv *= ivec2(2, 1);
	hdr_iv += ivec2(vbuffer.pos);
	vec3 hdr_color = sample_hdr_buffer_texel(vbuffer, hdr_iv);
	return hdr_color;
}

vec2 getGlowCoordUV(vec2 uv) {
	vec2 iv = uv * vec2(431.0, 242.0);
	// iv += vec2(2, 0);
	return iv;
}

vec3 sample_sdf_texel(vec2 iv) {
	if(iv.y > 121.0){
		return texelFetch(tex_glow, ivec2(iv), 0).rgb;
	} else {
		return texelFetch(tex_glow, ivec2(iv) + ivec2(0, 120), 0).rgb;
	}
}

float materialOcclusionFactor(uint material){
	if(material == 0u){
		return 0.89; // Opaque
	}
	if(material == 1u){
		return 0.98; // Liquid
	}
	if(material == 2u){
		return 1.0; // Emissive
	}

	return 1.0; // Gas
}

// TODO: These need to be matched with the values used in other shaders and lua
#define K_CLEAR 0.001
#define K_OCCLUDER 0.02

vec3 cast_ray_point(vec2 target, vec3 target_color){
	vec2 pos = getGlowCoordUV(tex_coord_glow_);
	target = getGlowCoordUV(target);

	target = clamp(target, vec2(1.0), GLOW_BOUNDS);
	vec2 dir = normalize(target - pos);
	float dist =  distance(tex_coord_glow_ * GLOW_BOUNDS, target);
	float distToTarget = distance(pos, target);

	float dt = 0.0;
	float inside_dist = 0.0;

	int DEBUG_maxSteps = 0;
	float rayIntensity = 1.0;
	const int STEPS = 32;

	for(int j = 0; j < STEPS; j++){
		vec2 next_pos = pos + dir * dt;

		// Sample SDF and material info
		SDFSample sdfSample = sample_sdf_texel(ivec2(next_pos) & ~0);
		float d = sdfSample.dist * 255.0;

		float occlusionFactor = materialOcclusionFactor(sdfSample.material);

		if(dt + d > distToTarget){
			rayIntensity *= pow(occlusionFactor, distToTarget - dt);
			break;
		} else {
			rayIntensity *= pow(occlusionFactor, d);
			dt += max(d, 0.5);
		}
	}

	float geometricFalloff = 1.0 / (1.0 + K_CLEAR * distToTarget * distToTarget);
	return target_color * rayIntensity * geometricFalloff;
}


uvec3 getGlowLight(ivec2 iv){
	ivec2 monte_carlo_iv = iv & 0xFFFFFFFE;
	uvec3 glow_texel_0 = uvec3(texelFetch(tex_glow, monte_carlo_iv + ivec2(0,0), 0).rgb * 255.0);
	uvec3 glow_texel_1 = uvec3(texelFetch(tex_glow, monte_carlo_iv + ivec2(1,0), 0).rgb * 255.0);
	uvec3 glow_texel_2 = uvec3(texelFetch(tex_glow, monte_carlo_iv + ivec2(0,1), 0).rgb * 255.0);
	uvec3 glow_texel_3 = uvec3(texelFetch(tex_glow, monte_carlo_iv + ivec2(1,1), 0).rgb * 255.0);

	return uvec3(
		(glow_texel_0.g << 8) | (glow_texel_0.b & 0xF0) | (glow_texel_1.g >> 4),
		((glow_texel_1.g & 0xF) << 12) | ((glow_texel_1.b & 0xF0) << 4) | (glow_texel_2.g),
		((glow_texel_2.b & 0xF0) << 8) | (glow_texel_3.g << 4) | (glow_texel_3.b >> 4)
	);
}

vec3 getGlowColor(ivec2 hdr_iv){
	ivec2 block_iv = hdr_iv & 0xFFFFFFFE;
	// return vec3(vec2((block_iv >> 1) & 1), 0.0);
	uvec3 glow_texel_0 = uvec3(texelFetch(tex_glow, block_iv + ivec2(0,0), 0).rgb * 255.0);
	uvec3 glow_texel_1 = uvec3(texelFetch(tex_glow, block_iv + ivec2(1,0), 0).rgb * 255.0);
	uvec3 glow_texel_2 = uvec3(texelFetch(tex_glow, block_iv + ivec2(0,1), 0).rgb * 255.0);
	uvec3 glow_texel_3 = uvec3(texelFetch(tex_glow, block_iv + ivec2(1,1), 0).rgb * 255.0);

	uvec3 hdr_glow = uvec3(0);

	hdr_glow.r = (glow_texel_0.g << 8) | (glow_texel_0.b & 0xF0) | (glow_texel_1.g >> 4);
	hdr_glow.g = ((glow_texel_1.g & 0xF) << 12) | ((glow_texel_1.b & 0xF0) << 4) | (glow_texel_2.g);
	hdr_glow.b = ((glow_texel_2.b & 0xF0) << 8) | (glow_texel_3.g << 4) | (glow_texel_3.b >> 4);

	return vec3(hdr_glow) / 65535.0;
}

vec3 getGlowLightBilinear(vec2 uv){
	ivec2 monte_carlo_iv = ivec2(uv * textureSize(tex_glow, 0)) & 0xFFFFFFFE;
	vec2 weight = fract(uv * vec2(textureSize(tex_glow, 0)) / 2.0);
	vec3 glow0 = vec3(getGlowLight(monte_carlo_iv + ivec2(0,0))) / 255.0;
	vec3 glow1 = vec3(getGlowLight(monte_carlo_iv + ivec2(2,0))) / 255.0;
	vec3 glow2 = vec3(getGlowLight(monte_carlo_iv + ivec2(0,2))) / 255.0;
	vec3 glow3 = vec3(getGlowLight(monte_carlo_iv + ivec2(2,2))) / 255.0;

	vec3 A = mix(glow0, glow1, weight.x);
	vec3 B = mix(glow2, glow3, weight.x);
	return mix(A, B, weight.y);
}



// For Future sunlight and moonlight calculations ===================================================
// ==================================================================================================

// float cast_ray_skylight(vec2 origin){
// 	const float steps = 64.0;


// 	// Daytime lasts for 3/4 of a cycle, night lasts for 1/4
// 	// Need to map this to sun rotation

// 	float sun_rotation = 0.0;
// 	float t = mod(RL_time.x + 0.5, 1.0);

// 	if(t < 0.25){
// 		sun_rotation = t * 2.0;
// 		return 0.0;
// 	} else {
// 		sun_rotation = 0.5 + ((t - 0.25) / 0.75) * 0.5;
// 	}

// 	sun_rotation += 0.5;

// 	vec2 dir = vec2(
// 		-cos(sun_rotation * 6.283185307179586),
// 		-sin(sun_rotation * 6.283185307179586)
// 	);

// 	float dt = 0.0;
// 	vec3 color = vec3(0.0);
// 	float occlusion = 1.0;

// 	for(float j = 0.0; j < steps; j++){
// 		vec2 next_pos = origin + dir * dt;
// 		float d = unpack_df_from_sample(next_pos / textureSize(tex_glow, 0));
// 		d = max(abs(d), 1.0) * sign(d);

// 		if (occlusion < 0.01) {
// 			break;
// 		}

// 		if(d < 0.0){
// 			// Wall
// 			occlusion *= pow(0.9, abs(d));
// 			dt += max(abs(d), 1.0);
// 		} else {
// 			// Air
// 			dt += max(abs(d), 1.0);
// 		}

// 		// vec2 fgCoord = next_pos / vec2(textureSize(tex_glow, 0));
// 		// vec4 fg_sample = texture2D(tex_fg, vec2(fgCoord.x, 1.0 - fgCoord.y) );
// 		// if(fg_sample.a == 0.0){
// 		// 	intensity = occlusion;
// 		// 	break;

// 		// }

// 		if(next_pos.x < 0.0 || next_pos.x >= 431.0 || next_pos.y < 0.0 || next_pos.y >= 242.0){
// 			// vec4 fg_sample = texture2D(tex_fg, next_pos / textureSize(tex_glow, 0));
// 			// intensity = occlusion * (1.0 - fg_sample.a);
// 			// intensity = (occlusion);
// 			// occlusion *= dt / 64.0;
// 			break;
// 		}
// 	}

// 	// occlusion = min(1.0, pow(occlusion, 1.0 - dt / 200.0));

// 	return occlusion;
// }


vec4 DEBUG_show_num_lights(){
	vec3 accumulated_light = vec3(0.0);
	ivec2 cell_coord = ivec2(tex_coord_y_inverted_ * textureSize(RL_tex_lights, 0));

	ivec4 byte = ivec4(texelFetch(RL_tex_lights, cell_coord, 0) * 255.0);

	int bitfield = byte.r + (byte.g << 8) + (byte.b << 16) + (byte.a << 24);

	float count = float(bitCount(bitfield));

	// TODO: This constant can be calculated somehow but I didn't want to think about it
	vec2 coord = mod(tex_coord_, vec2(0.0189, 0.0336)) + vec2(0.02, 0.0);
	vec3 digit_color = vec3( digits( coord, float(count), 0.0, 0.0));

	vec3 color = step(0.01, count) * digit_color * debugColors[(int(count) * 2 + 1) % 16];

	return vec4(color, color == vec3(0.0) ? 0.0 : 1.0);
}

vec3 getPointLightSources(){
	vec3 accumulated_light = vec3(0.0);
	ivec2 cell_coord = ivec2(tex_coord_y_inverted_ * textureSize(RL_tex_lights, 0));

	ivec4 byte = ivec4(texelFetch(RL_tex_lights, cell_coord, 0) * 255.0);

	int bitfield = byte.r + (byte.g << 8) + (byte.b << 16) + (byte.a << 24);

	int bit;
	int test_count = 0;

	// vec3 terrain_normal = sample_terrain_normal();

	vec3 test_color = vec3(0.0);

	while((bit = findLSB(bitfield)) != -1){
        bitfield &= (bitfield - 1);

		vec4 byte_1 = texelFetch(RL_tex_light_list, ivec2(bit * 2, 1), 0);
		vec4 byte_2 = texelFetch(RL_tex_light_list, ivec2(bit * 2 + 1, 1), 0);

		vec2 light_pos = vec2(byte_1.r, byte_1.g);
		// vec3 light_color = byte_2.rgb;
		vec3 light_color = floor(byte_2.rgb * 15.0) / 15.0;

		// DEBUG: Verify that light sources align with the entity
		// float dist_from_light = step(distance(light_pos, tex_coord_y_inverted_), 0.03);
		// test_color += vec3(dist_from_light) * light_color;
		// test_color += vec3(dist_from_light) * byte_1.b;

		vec3 point_light = cast_ray_point(light_pos, srgb2rgb(light_color));

		// TODO: Phong
		// if (d_here <= 0.0){
		// 	vec3 light_dir = normalize(vec3(light_pos, 0.0) - vec3(tex_coord_y_inverted_, 0.0));
		// 	// Additive
		// 	float diffuse = max(0.0, dot(terrain_normal, light_dir));
		// 	accumulated_light += point_light * (1.0 + diffuse);

		// 	// Subtractive
		// 	// float diffuse = max(0.3, dot(terrain_normal, light_dir));
		// 	// accumulated_light += point_light * diffuse;

		// 	// Flat
		// 	// accumulated_light += point_light;
		// } else {
		// 	accumulated_light += point_light;
		// }

		accumulated_light += point_light;
	}

	// return test_color;

	return accumulated_light;
}


vec3 rtx_compute(){
	vec4 fg_srgb = texture(tex_fg, tex_coord_);
	vec4 bg_srgb = texture(tex_bg, tex_coord_);
	// Don't allow too dark pixels
	fg_srgb.rgb = max(vec3(0.01), fg_srgb.rgb);
	vec3 fg_linear = srgb2rgb(fg_srgb.rgb);
	vec3 bg_linear = srgb2rgb(bg_srgb.rgb);

	vec3 summed_light = vec3(0.0);

	vec3 point_light = getPointLightSources();
	vec2 coord_glow_compensated = tex_coord_glow_ + camera_compensation() / GLOW_BOUNDS;
	// vec3 hdr_glow_unfiltered = sample_hdr_buffer(HDR_VBUF_0, coord_glow_compensated);
	// vec3 hdr_glow_unfiltered = sample_hdr_buffer_gaussian_5x5(HDR_VBUF_0, coord_glow_compensated);
	vec3 hdr_glow_unfiltered = sample_hdr_buffer_gaussian_3x3(HDR_VBUF_0, coord_glow_compensated);
	vec3 hdr_glow_uninterpolated = sample_hdr_buffer_uninterpolated(HDR_VBUF_0, coord_glow_compensated); // uninterpolated

	vec3 glow_light = hdr_glow_unfiltered;
	// vec3 hdr_glow = hdr_glow_uninterpolated;

	const float dust_amount = 0.0;

	vec3 dust_light = vec3(dust_amount);

	const vec3 ambient = vec3(0.1);

	// Light multipliers
	const float point_mul = 3.0;
	const float glow_mul = 0.2;

	point_light *= point_mul;
	glow_light *= glow_mul;

	// Linear summation
	summed_light += ambient;
	summed_light += point_light;
	summed_light += glow_light;
	summed_light += dust_light;

	// Final brightness multiplier
	summed_light *= 1.0;

	// Multiply with scene and composite
	vec3 fg_multiplied = fg_linear * summed_light;
	vec3 bg_multiplied = bg_linear; // Probably doesn't need anyting done to it?
	vec3 composited = mix(bg_multiplied, fg_multiplied, fg_srgb.a);

	// Final exposure adjustment and tonemapping
	float exposure = 1.0;
	vec3 composited_tonemapped = tonemap(composited * exposure);

    // Output as sRGB
	vec3 color = rgb2srgb(composited_tonemapped);


	// ================ Buffer visualisations ================

	// Glow buffer
	// color = texelFetch(tex_glow, ivec2((tex_coord) * GLOW_SIZE), 0).rgb;

	// Source glow buffer
	// color = texelFetch(tex_glow_unfiltered, ivec2((tex_coord) * GLOW_SIZE), 0).rgb * 4.0;

	// Unlit forgreound texture
	// color = fg_srgb.rgb;

	// Glow light
	// color = glow_light;
	// color = rgb2srgb(glow_light);
	// color = glow_light;
	// color = rgb2srgb(glow_light);

	// Point light
	// color = glow_light * 0.02;

	// Summed light
	// color = summed_light;
	// color = rgb2srgb(summed_light);



	// ================ SDF Ring visualisation ================

	// SDFSample sdf = sample_sdf_texel(ivec2(tex_coord * GLOW_BOUNDS));
	// uint dist = uint(sdf.dist * 255.0);
	// float ring = ((dist & 3) == 0) ? (1.0 - sdf.dist * 3.0) * 0.3 : 0.0;
	// color = mix(color, vec3(0.0, 1.0, 1.0), max(0.0, ring));



	// ================ Emissive pixel visualisation ================
	// Emissive areas will be larger than the materials due to being expanded in glow2

	// bool emitter_here = sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS)) == 2u;
	// bool emitter_side = (
	// 	sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2( 1,  1)) == 2u ||
	// 	sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2(-1,  1)) == 2u ||
	// 	sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2( 1, -1)) == 2u ||
	// 	sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2(-1, -1)) == 2u
	// );
	// if(!emitter_here && emitter_side) {
	// 	color = vec3(0.0, 1.0, 1.0);
	// } else if(emitter_here) {
	// 	color = sample_emitter_color(tex_coord_glow_);
	// }


	// ================ Light bucket count visualisation ================
	// vec4 num_lights = DEBUG_show_num_lights();
	// color = mix(color, num_lights.rgb, num_lights.a);


	return color;
}



// ==================================================================================================

// -----------------------------------------------------------------------------------------------
// utilities

vec3 srgb2lin_fast(vec3 c) { return c*c; }
vec3 lin2srgb_fast(vec3 c) { return sqrt(c); }

vec4 unpack_noise( vec4 noise ) { return mix(vec4(0.5,0.5,0.5,0.5), mix(vec4(-0.5), vec4(1.5), noise), dithering_amount); } // converts [0.0,1.0] to [-0.5,1.5], which is ideal for dithering

#ifdef DITHER
	vec3 dither(vec3 c, float noise, float ratio)      { return c + noise / ratio; }
	vec3 dither_srgb(vec3 c, float noise, float ratio) { return srgb2lin_fast(dither(lin2srgb_fast(c), noise, ratio )); }
#else
	vec3 dither(vec3 c, float noise, float ratio)      { return c; }
	vec3 dither_srgb(vec3 c, float noise, float ratio) { return c; }
#endif

#define T time


// trip "fractals" effect. this is based on some code from ShaderToy, which I can't find anymore.

#ifdef TRIPPY
float mlength(vec2 uv) {
	uv = abs(uv);
    return uv.x + uv.y;
}

mat2 rotate(float a) {
	float c = cos(a), 
        s = sin(a);
    return mat2(c, -s, s, c);
}

float sinp(float v) {
	return .5 + .5 * sin(v);
}

float sinr(float v, float a, float b) {
	return mix(a, b, sinp(v));
}

float shape(vec2 uv) {

    vec2 f = fract(uv) - .5;
	
    // trying manhattan dist
    vec2 st = vec2(atan(f.x, f.y), mlength(f));

	float k = sinr(T * .05, 2., 12.);
    float a = 4.;
    
    return cos(st.y * k + st.x * a + T) * 
        	cos(st.y * k - st.x * a + T) * 
        	smoothstep(.2, .8, st.y);
}

vec3 render(vec2 uv) {

    uv = abs(uv) - sinr(T * .5, .25, .5);

    float t = shape(uv) + 
        clamp(abs(.2 / shape(uv)) * .25, .0, 2.); // glow
   
    // rotate, scale and layer
    uv *= rotate(.785);
    t *= shape(uv) + 
        clamp(abs(.03 / shape(uv)) * .25, .0, .9);
    //t *= length(uv);
   
    return mix(vec3(t, .4, sinr(T, .3, .8)),
               vec3(.1, .0, .3), t);
}
#endif


// -----------------------------------------------------------------------------------------------

vec3 sample_buffer_texel(VBuffer vbuffer, ivec2 st) {
	st += ivec2(vbuffer.pos);
	return texelFetch(tex_glow, st, 0).rgb;
}

vec3 sample_emitter_color_texel(ivec2 st){
    ivec2 color_st = st;

    bool top = color_st.y >= int(GLOW_SIZE.y / 2.0 - 1.0);

    if(top){
        color_st.y -= int(GLOW_SIZE.y / 2);
    }

    color_st /= 2;

	uvec3 smp = uvec3(sample_buffer_texel(VBUF_COLOR_1, color_st) * 255.0) & 0xFF;

    uvec3 color_u = uvec3(0);

    if(top){
        color_u = uvec3(
            smp.g,
            smp.b >> 4,
            smp.b
        );
    } else {
        color_u = uvec3(
            smp.r >> 4,
            smp.r,
            smp.g >> 4
        );
    }

    color_u = color_u & 0xF;

    vec3 color = vec3(color_u << 4) / 255.0;

	// if (color == vec3(0.0)) {
	// 	return vec3(vec2(st) / VBUF_SIZE,  0.0);
	// }

    return color;
}

uint sampleMaterial(ivec2 st){
	if (st.y < 120) {
		uint data = uint(texelFetch(tex_glow, st + ivec2(0, 120), 0).b * 255.0);
		return (data >> 6) & 0x3u;
	} else {
		uint data = uint(texelFetch(tex_glow, st, 0).b * 255.0);
		return (data >> 4) & 0x3u;
	}
}

vec3 sample_emitter_color(vec2 uv) {
    ivec2 emitter_st = ivec2(uv * GLOW_BOUNDS);
	vec3 smp = sample_emitter_color_texel(emitter_st);
	return smp;
}

uvec3 sample_glow_source_st(ivec2 st){
	uvec3 color_u = uvec3(texelFetch(tex_glow_unfiltered, st, 0).rgb * 255.0);

	// Non-glow materials
	if((color_u.r & 0x80) != 0){
		return uvec3(0);
	}

	// Kill superbright particles
	// uint maxChannel = max(color_u.r, max(color_u.g, color_u.b));
	// if(maxChannel > 0xFu){
	// 	color_u >>= 4;
	// }

    // Strip non-color bits
    // color_u = color_u & 0xF;

	// Bring back into original range
	// color_u *= 4;

    return color_u;
}


void main()
{
	// constants
	const bool ENABLE_REFRACTION 			= 0>0;
	const bool ENABLE_LIGHTING	    		= 1>1;
	const bool ENABLE_FOG_OF_WAR 			= 1>0;
	const bool ENABLE_GLOW 					= 1>1;
	const bool ENABLE_GAMMA_CORRECTION		= 1>0;
	const bool ENABLE_PATH_DEBUG			= 1>0;
	
	const float DISTORTION_TIME_SPD 		= 10.0;
	const float DISTORTION_SCALE_MULT 		= 50.0;
	const float DISTORTION_SCALE_MULT2 		= 0.002;
	
	const float REFLECTION_SAMPLES 			= 50.0;
	const float REFLECTION_SAMPLE_DISTANCE 	= 0.0045;
	const float REFLECTION_INTENSITY 		= 0.65;
	const float REFLECTION_MAX_DISTANCE 	= REFLECTION_SAMPLES * REFLECTION_SAMPLE_DISTANCE;

	const vec4  FOG_FOREGROUND 				= vec4(0.6,0.6,0.6,1.0);
	const vec3  FOG_BACKGROUND 				= vec3(0.7,0.7,0.7);

	const vec4  FOG_FOREGROUND_NIGHT 		= vec4(0.2,0.2,0.2,1.0);
	const vec3  FOG_BACKGROUND_NIGHT 		= vec3(0.2,0.2,0.2);

	const vec2  NOISE_TEX_SIZE				= vec2( 1024.0, 1024.0 );

	const float EXTRA_BRIGHT_INTENSITY = 0.25;
	
	const vec3 LOW_HEALTH_INDICATOR_COLOR = vec3( 0.7, 0.1, 0.0 );

	const float SCREEN_W = 427.0;
	const float SCREEN_H = 242.0;
	// const float SCREEN_H = 242.0;

// ==========================================================================================================
// fetch texture coords etc =============================================================================

	vec2 tex_coord = tex_coord_;
	vec2 tex_coord_y_inverted = tex_coord_y_inverted_;
	vec2 tex_coord_glow = tex_coord_glow_;

	float seed = floor((tex_coord_.x - subpixel.x) * 427.0 + camera_pos.x);
    float offset = texture2D( tex_noise, vec2( seed / 1024.0, 0.0 ) ).r + 0.5;
	offset *= fract(max(time - 780.0,0.0) / 10.0);

	// offset *= (distance(tex_coord, vec2(0.5,0.5)));

	// tex_coord.y += offset;
	// tex_coord_glow.y -= offset;

// ===========================================================================================================
// get noise. R G B and A channels each contain unique noise from the same source ============================

    float noise_time = mod(time, 1000.0);
    vec2 noise_scale = vec2(1.0,1.0) / ( NOISE_TEX_SIZE / window_size ); // scale the noise so that 1 pixel on source maps to 1 pixel on screen. TODO: move this math to CPU

    vec4 noise = unpack_noise( texture2D( tex_noise, tex_coord * noise_scale + noise_time * 10.0 ) );
    vec4 noise_perlin2 = texture2D( tex_perlin_noise, world_pos * 0.0004 + vec2(0.0,noise_time * 0.005) );

// ===========================================================================================================
// liquid distortion/refraction effect (calculate distorted texture coordinates for later use) ===============
  
  	const float SHADING_BRIGHT_BITS_ALPHA = 0.25;
    const float SHADING_LIQUID_BITS_ALPHA = 0.99;

	vec4 extra_data = texture2D( tex_glow_unfiltered, tex_coord_glow );

	float liquid_mask      = step( SHADING_LIQUID_BITS_ALPHA, extra_data.a );
	float very_bright_mask = step( SHADING_BRIGHT_BITS_ALPHA, extra_data.a ) - liquid_mask;

	if (ENABLE_REFRACTION)
	{
		float distortion_mult  = time * DISTORTION_TIME_SPD; // time * (DISTORTION_TIME_SPD - 5.0 *drugged_distortion_amount);

		vec2 liquid_distortion_offset = vec2(
			liquid_mask * sin( distortion_mult + (tex_coord.x + camera_pos.x / world_viewport_size.x ) * DISTORTION_SCALE_MULT) * DISTORTION_SCALE_MULT2, 
			liquid_mask * cos( distortion_mult + (tex_coord.y - camera_pos.y / world_viewport_size.y ) * DISTORTION_SCALE_MULT) * DISTORTION_SCALE_MULT2 
			) / camera_inv_zoom_ratio;
			
		// distort the texture coordinate if the pixel we would sample is liquid
		vec4 extra_data_at_liquid_offset = texture2D( tex_glow_unfiltered, tex_coord_glow + vec2( liquid_distortion_offset.x, -liquid_distortion_offset.y ) );
		liquid_distortion_offset *= step( SHADING_LIQUID_BITS_ALPHA, extra_data_at_liquid_offset.a );

		tex_coord = tex_coord + liquid_distortion_offset;
		tex_coord_y_inverted += vec2( liquid_distortion_offset.x, -liquid_distortion_offset.y );
		tex_coord_glow += vec2( liquid_distortion_offset.x, -liquid_distortion_offset.y );
	}

   	vec2 pos_seed = vec2(camera_pos.x / SCREEN_W, camera_pos.y / SCREEN_H) + vec2( tex_coord_.x, - tex_coord_.y );

#ifdef TRIPPY
   	// trip distortion
	pos_seed = floor(pos_seed * SCREEN_W) / SCREEN_W; // pixelate
	vec2 perlin_noise = texture2D(tex_perlin_noise, pos_seed*0.1 + vec2(time,time)*0.01).xy - vec2(0.5,0.5);
	perlin_noise += texture2D(tex_perlin_noise, pos_seed*0.3 + vec2(time,time)*0.005).xy - vec2(0.5,0.5);
	float tex_coord_warped_zoom = min( 1.0, drugged_distortion_amount * 1.5 ); // zoom in a little to avoid sampling past texture edges
	vec2 tex_coord_warped = (tex_coord - vec2(0.5,0.5)) * mix(1.0, 0.9, tex_coord_warped_zoom ) + vec2(0.5,0.5);
	tex_coord = tex_coord_warped;
	tex_coord_warped += perlin_noise.xy * 0.2;
	float tex_coord_warped_lerp = length(tex_coord - vec2(0.5,0.5)) * drugged_distortion_amount;
	tex_coord = mix( tex_coord, tex_coord_warped, tex_coord_warped_lerp );

   	pos_seed = vec2(camera_pos.x / SCREEN_W, camera_pos.y / SCREEN_H) + vec2( tex_coord.x, - tex_coord.y );
#endif

// ===========================================================================================================
// sample the original color =================================================================================

	vec3 color    = texture2D(tex_bg, tex_coord).rgb;
	vec4 color_fg = texture2D(tex_fg, tex_coord);
	
#ifdef TRIPPY
	// drunk doublevision
	vec2 doublevision_offset = vec2(0.005 * cos(time*0.5)  * drugged_doublevision_amount,0.005 * sin(time*0.5) * drugged_doublevision_amount );
	color_fg = mix( color_fg, texture2D(tex_fg, tex_coord + doublevision_offset  ), 0.5 );
	color = mix( color, texture2D(tex_bg, tex_coord + doublevision_offset  ).rgb, 0.5 );
#endif

	vec3 color_orig    = color;
	vec4 color_fg_orig = color_fg;

// ============================================================================================================
// sample glow texture ========================================================================================

	vec3 glow = vec3(0.0,0.0,0.0);
	if (ENABLE_GLOW)
	{
		// fetch the glow without doing any filtering
		glow = texture2D(tex_glow, tex_coord_glow).rgb;

		#ifdef HIQ
			// fetch a blurred (less banded) version of the glow. the banding mostly occurs against dark backgrounds so we use the non-smooth glow where the sky is visible
			const float GLOW_BLUR_OFFSET  = 0.02;
			const float GLOW_BLUR_OFFSET2 = 0.02;

			vec3 glow_smooth = glow;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( 0, GLOW_BLUR_OFFSET )).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( 0, -GLOW_BLUR_OFFSET)).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2(-GLOW_BLUR_OFFSET2,  0)).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( GLOW_BLUR_OFFSET2,  0)).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( 0, GLOW_BLUR_OFFSET2 )).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( 0, -GLOW_BLUR_OFFSET2)).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2(-GLOW_BLUR_OFFSET2,  0)).rgb;
			glow_smooth += texture2D(tex_glow, tex_coord_glow + vec2( GLOW_BLUR_OFFSET2,  0)).rgb;
			glow_smooth *= 0.11111;

			// use smoothed glow when the glow doesn't overlap with sky to get rid of banding
			float smoothing_amount = (1.0 - (glow_smooth.r + glow_smooth.g + glow_smooth.b) * 0.3333) * color_fg.a;
			glow = mix(glow, glow_smooth, smoothing_amount );
			glow = dither_srgb(glow, noise.r, 128.0 );
			glow = max( vec3(0.0), glow - vec3(1.0/128.0) );
		#endif

		glow = max( vec3(0.0), glow - 0.008 );

	#ifdef TRIPPY
		// trip "fractals"
		vec2 perlin_noise_static = texture2D(tex_perlin_noise, pos_seed*0.1+ vec2(time,time)*0.0001 ).xy - vec2(0.5,0.5);

		float fractals_alpha = sqrt( (color_fg.r + color_fg.g + color_fg.b) * 0.333 ) * 2.0;
		pos_seed = floor(pos_seed * SCREEN_W) / SCREEN_W; // pixelate
		pos_seed += perlin_noise * 0.01; // moving wave distortion
		pos_seed += perlin_noise_static * 0.15; // static wave distortion

		vec3 fractals0 = render( pos_seed * ( mix( 20.0, 20.0 - (perlin_noise_static.x+perlin_noise_static.y) * 15.0, drugged_fractals_size  ) ) ) * 0.2;
		fractals0 = max(fractals0,vec3(0.0));
		glow.rgb += fractals0.rgb * fractals_alpha * 2.5 * drugged_fractals_amount;
	#endif
	}

// ============================================================================================================
// sample light texture =======================================================================================

	vec4 light_tex_sample = texture2D(tex_lights, tex_coord);
	vec3 lights = light_tex_sample.rgb * 0.8;

// ============================================================================================================
// fetch skylight contribution from a texture =================================================================

	float sky_ambient_amount;
	float fog_amount;
	if (ENABLE_LIGHTING)
	{
		const float SKY_Y_OFFSET   = 90.0;
		const float SKY_PIXEL_SIZE = 64.0;
		const vec2  SKY_TEX_SIZE   = vec2( 32.0 );

		// world coordinates -> skylight texture coordinates // TODO: move math to CPU
		vec4 sky_value = texture2D(tex_skylight, tex_coord_skylight );

		#ifdef HIQ
			sky_value = sky_value + (
	                           + texture2D(tex_skylight, tex_coord_skylight - vec2(1.0,0.0) / SKY_TEX_SIZE.x )
	                           + texture2D(tex_skylight, tex_coord_skylight + vec2(1.0,0.0) / SKY_TEX_SIZE.y )
	                           + texture2D(tex_skylight, tex_coord_skylight - vec2(0.0,1.0) / SKY_TEX_SIZE.x )
	                           + texture2D(tex_skylight, tex_coord_skylight + vec2(0.0,1.0) / SKY_TEX_SIZE.y ) )*0.25;
		    sky_value *= 0.5;
		#endif

		sky_ambient_amount = sky_value.r;
		fog_amount = texture2D(tex_skylight, tex_coord_skylight + (noise_perlin2.xy-0.5)*0.05 ).r;
	}
	else
	{
		sky_ambient_amount = 0.0;
	}

	sky_ambient_amount *= sky_ambient_amount;

// ============================================================================================================
// calculate fog of war =======================================================================================

	// fetch fog of war and dust contribution from a texture
	float fog_of_war_amount = 1.0;
	float dust_amount = 0.0;
	if (ENABLE_FOG_OF_WAR)
	{
		vec2 FOG_TEX_SIZE = vec2( 64.0 ) * camera_inv_zoom_ratio;

		vec4 fog_value = texture2D( tex_fog, tex_coord_fogofwar );

		#ifdef HIQ
			const float s  = 0.25;
			const float s2 = 0.75;
			fog_value = fog_value + (
	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )

	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,0.0) /  FOG_TEX_SIZE.x * s2 )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,0.0) /  FOG_TEX_SIZE.y * s2 )
	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(0.0,1.0) /  FOG_TEX_SIZE.x * s2 )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(0.0,1.0) /  FOG_TEX_SIZE.y * s2 ) );
		    fog_value *= 0.1111111;
		#else
			const float s = 0.5;
			fog_value = fog_value + (
	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s ) );
		    fog_value *= 0.2;
		#endif

		fog_of_war_amount = fog_value.r * (1.0-light_tex_sample.a); // light_tex_sample.a contains "fog of war holes" (for example temporary holes caused by explosions)
		dust_amount = fog_value.g;
		fog_of_war_amount = 0.0;
	}

// ============================================================================================================
// get sky light color ========================================================================================
	
	lights = pow( lights, vec3( 1.5 ) );

	// apply light from the glow buffer ---
	lights += glow; 

	vec3 sky_light = sky_light_color.rgb * sky_ambient_amount;

	// apply light from the sky ---
	//sky_ambient_amount = max(0.0,sky_ambient_amount);
	lights -= sky_light;
	lights = max(lights,vec3(0.0));
	lights += sky_light;
	lights = min( lights, vec3(1.0) );

	// correct the gamma
	if (ENABLE_GAMMA_CORRECTION)
		lights = pow(lights, vec3(1.0 / 2.2));

	lights = dither_srgb(lights, noise.g, 128.0);
	
// ==========================================================================================================
// fog of war ================================================================================================

	float fog_of_war_sky_ambient_amount = sky_ambient_amount;
	float fade = clamp( (world_pos.y - 250.0) / 100.0, 0.0, 1.0 );
	fog_of_war_sky_ambient_amount *= 1.0-fade;
	float sky_ambient2 = sqrt( fog_of_war_sky_ambient_amount );
	vec3 fog_of_war = 1.4 * vec3(0.6,0.5,0.45) * vec3( max( 0.0, 1.0 - fog_of_war_amount - sky_ambient2 ) );
	// fog_of_war = min( vec3(1.0), max( dither_srgb( 1.1 * fog_of_war, noise.b, 32.0 ), fog_of_war_sky_ambient_amount ) );
	// fog_of_war = pow( fog_of_war, vec3( 0.6 ) );
	fog_of_war = min( vec3(1.0), max( dither_srgb( 2.0 * fog_of_war, noise.b, 32.0 ), fog_of_war_sky_ambient_amount ) );

	lights *= fog_of_war;
	lights += max(0.35 - fog_of_war_sky_ambient_amount, 0.0) * dither_srgb( fog_of_war, noise.b, 128.0 );

// ==========================================================================================================
// apply fog ================================================================================================

	float luminousity = sqrt(min(1.0,dot(lights, vec3(0.299, 0.587, 0.114)*1.0)));

	float fog_amount_underground = dust_amount;
	float fog_amount_fg = mix( fog_amount_underground, fog_amount_foreground, sky_ambient_amount );
	fog_amount = max(fog_amount,fog_amount_underground);
	float fog_amount_multiplier_final = max(sky_ambient_amount, fog_amount_underground * luminousity * min(1.0,noise_perlin2.x*noise_perlin2.x*2.0) );

	vec4 fog_color_fg = mix( FOG_FOREGROUND, FOG_FOREGROUND_NIGHT, max(night_amount,1.0-sky_ambient_amount) );
	vec3 fog_color_bg = mix( FOG_BACKGROUND, FOG_BACKGROUND_NIGHT, night_amount );

	fog_amount = dither_srgb(vec3(fog_amount), noise.b, 64.0).r;
	fog_amount = fog_amount_fg * fog_amount;
	
	// apply fog to bg
	color = mix(color, fog_color_bg, fog_amount_background);
	color = mix(color , dither_srgb(color, noise.a, 64.0 ), fog_amount );

// ==========================================================================================================
// nightvision ==============================================================================================

	float edge_dist = length(tex_coord - vec2(0.5)) * 2.0;
	float edge_dist_inv = 1.0 - edge_dist;
	lights += vec3(edge_dist_inv * drugged_nightvision_amount);
	edge_dist = clamp( edge_dist, 0.0, 1.0 );

// ==========================================================================================================
// blend foreground and background ==========================================================================

	// reverse the blending effects applied when composing foreground layers
	color_fg.a   = pow(color_fg.a, 0.5);
	color_fg.rgb = color_fg.rgb * ( 1.0 / color_fg.a );
	color_fg.rgb = clamp(color_fg.rgb, vec3(0.0,0.0,0.0), vec3(1.0,1.0,1.0));

	// apply the lighting to the foreground
	if (ENABLE_LIGHTING)
		color_fg.rgb *= lights;

	// fog
	color_fg.rgb = mix( color_fg.rgb, fog_color_fg.rgb, fog_amount_fg * fog_amount_multiplier_final );

	// combine foreground and background
	// NOTE( Petri ): Apparently the sky can sometimes be black and color_fg.a being 0 is at fault for that
	// Credit to Noita community for finding this bug.
	if( color_fg.a == 0.0 ) {
		color = color;
	} else {
		color = color_fg.rgb * color_fg.a + color * (1.0-color_fg.a);
	}


// ============================================================================================================
// color correction effect ====================================================================================

	color = mix(color, vec3((color.r + color.g + color.b) * 0.3333), color_grading.a);
	color = color * color_grading.rgb;
	vec3 color2 = color;
	// color = mix(color2, color, clamp( color_grading.a - glow * 3.0, 0.0, 1.0 ) ); // min(sqrt(sky_ambient_amount) * 5.0, 1.0) - glow * 3.0);

// ============================================================================================================
// apply glow effect using a variation of screen blending. the glow is reduced on areas with bright sky light =

	if (ENABLE_GLOW)
	{
		vec3 sky_light_modulation = max( vec3(1.0 - sky_ambient_amount), sky_light_color.rgb );
		glow *= fog_of_war;
		color = max ( color + glow * 0.6 - 0.6 * lights, clamp((color + glow) - ( color * sky_light_modulation * glow), 0.0, 1.0));
	}

// ==========================================================================================================
// damage flash effect ======================================================================================

	// color = mix( color, vec3(1.0,0.0,0.0), damage_flash_interpolation * edge_dist * 0.7 );

// ==========================================================================================================
// shroom color effect ======================================================================================

	float brightness_shroom = max(color.r, max(color.g, color.b) );
	color.g = mix( color.g, brightness_shroom * 2.0 * color.g * (sin( time * 1.5 ) + 1.0) * 0.5 + noise.b / 64.0, drugged_color_amount);

// ============================================================================================================
// drunken afterimage effect ==================================================================================

	//vec3 amount = drugged_afterimage_zoom_mult * mix( vec3( drugged_afterimage_amount ), min( lights + sky_ambient_amount * sky_light_color, vec3( 1.0) ) * drugged_afterimage_amount, drugged_nightvision_amount);
	//color = mix( color, color_prev, amount );

// ============================================================================================================
// additive overlay ===========================================================================================

	// color.rgb += additive_overlay_color.rgb * additive_overlay_color.a; // TODO: combine with damage flash
	// color.rgb = mix( color, additive_overlay_color.rgb, additive_overlay_color.a );

// ============================================================================================================
// brightness / contrast=======================================================================================

	vec3 brightness = vec3( brightness_contrast_gamma.r, brightness_contrast_gamma.r, brightness_contrast_gamma.r );
	vec3 contrast = vec3( brightness_contrast_gamma.g );
	vec3 gamma = vec3( brightness_contrast_gamma.b, brightness_contrast_gamma.b, brightness_contrast_gamma.b );
	vec3 halfpoint = vec3( 0.5, 0.5, 0.5 );

	color += brightness;
	color = (color - halfpoint) * contrast + halfpoint;
	color = pow( color, gamma );

	color = clamp( color, 0.0, 1.0 ); // the resulting color needs to be clamped for the overlay to work correctly

// ============================================================================================================
// overlay ====================================================================================================

	// color.rgb = mix( color, overlay_color.rgb, overlay_color.a );
	// color.rgb = mix( color, overlay_color_blindness.rgb, overlay_color_blindness.a * 0.5 + overlay_color_blindness.a * edge_dist*edge_dist * 40.0);

// ============================================================================================================
// low health indicator =======================================================================================
// {
// 	float a = length(tex_coord - vec2(0.5,0.5));
// 	a *= 1.3;
// 	a *= a;
// 	a *= a;
// 	color += LOW_HEALTH_INDICATOR_COLOR * a * low_health_indicator_alpha;
// }

// ============================================================================================================
// various debug visualizations================================================================================

	// color.r += 1.0 - fog_of_war.r;

	//#define DEBUG_SKYLIGHT
	//#define DEBUG_NOISE
	//#define DEBUG_DEBUG
	#ifdef HIQ
		#define DEBUG_PATHFINDING
	#endif

	vec2 tex_coord_debug = tex_coord_;

	#ifdef DEBUG_SKYLIGHT
		debug_tex_coord = vec2(-0.01,-0.05) + vec2(tex_coord_debug.x, 1.0 - tex_coord_debug.y) * vec2(64.0,40.0 * world_viewport_size.x / world_viewport_size.y) / 64.0 * 0.8;
		color.rgb = mix( color.rgb, texture2D(tex_skylight, debug_tex_coord * 1.3).rgb, 0.5 ); // light
		color.g += 0.5 * texture2D(tex_skylight, debug_tex_coord).g; // minimap
	#endif

	#ifdef DEBUG_NOISE
		color = vec3( noise );
	#endif

	#ifdef DEBUG_PATHFINDING
		tex_coord = vec2(tex_coord_debug.x, 1.0 - tex_coord_debug.y);
		vec3 path_data = texture2D(tex_debug, tex_coord).rgb;
		path_data.g -= path_data.b * 0.04; // highlight areas with path data access
		color += path_data * vec3(1.0, 10.0, 4.0);
	#endif

	#ifdef DEBUG_DEBUG
		debug_tex_coord = vec2(0.45,-0.1) + tex_coord * 1.5 * vec2(1.0 / 15.625 * 2.0,1.0); // vec2(-0.01,-0.05) + vec2(tex_coord_glow.x, 1.0 - tex_coord_glow.y) * vec2(64.0,40.0 * world_viewport_size.x / world_viewport_size.y) / 64.0 * 0.8;
		color.r += 0.75 * texture2D(tex_debug2, debug_tex_coord).r; // 
	#endif

// ============================================================================================================
// output =====================================================================================================

	outColor.rgb = color;
	outColor.a = 1.0;

	// Apply Noita RTX lighting
	// TODO: This clobbers the rest of the shader output. Need better integration.
	outColor.rgb = rtx_compute();

}