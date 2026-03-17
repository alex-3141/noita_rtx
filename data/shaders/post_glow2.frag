#version 450 core
#extension GL_ARB_gpu_shader5 : enable

// TOTAL BUFFER SIZE: 431x242
// QUARTER RES VBUFFER SIZE: 107x60
// LAYOUT:
//     X: 107, 107, 107, 107, 2
//     Y: 60, 60, 1, 121

// TODO: Clear distinction between size and bounds like done lower down
struct VBuffer {
	vec2 pos;
	vec2 bounds;
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
const VBuffer EMITTER_SDF = VBuffer(vec2(HALF_WIDTH, 0), vec2(107, 59));


#define MIN_EXPOSURE 65535
#define MAX_EXPOSURE 16777215

// EXPOSURE_BLEND: How quickly exposure adapts to changes (per frame).
// Range: 0.01 - 0.5 | Lower = slower/smoother, Higher = faster/snappier
// 0.1 ≈ 10 frames to mostly adapt, 0.02 ≈ 50 frames
// TODO: Make this nonlinear?
#define EXPOSURE_BLEND 0.1

// ============================================================================

// Physical texture size
#define WIDTH 431.0
#define HEIGHT 242.0

#define HDR_WIDTH 215.0
#define HDR_HEIGHT 121.0

#define PACK_FLOAT_RANGE 8.0

// inputs
uniform sampler2D 	tex_glow_source;
uniform sampler2D 	tex_glow_source_particles;
uniform sampler2D 	tex_glow_prev_frame;
uniform vec2        one_per_glow_texture_size;
uniform float		time;

#define WALL vec3(1.0, 1.0, 1.0)
#define AIR vec3(0.0, 0.0, 0.0)

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
#endif

#ifndef FNC_RGB2SRGB
#define FNC_RGB2SRGB
float rgb2srgb(const in float c) {   return (c < 0.0031308) ? c * 12.92 : 1.055 * pow(c, 0.4166666666666667) - 0.055; }
vec3  rgb2srgb(const in vec3 rgb) {  return saturate(vec3(  rgb2srgb(rgb.r - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.g - SRGB_EPSILON), 
                                                            rgb2srgb(rgb.b - SRGB_EPSILON))); }
vec4  rgb2srgb(const in vec4 rgb) {  return vec4(rgb2srgb(rgb.rgb), rgb.a); }
#endif


#ifndef FNC_LUMINANCE
#define FNC_LUMINANCE
float luminance(in vec3 linear) { return dot(linear, vec3(0.21250175, 0.71537574, 0.07212251)); }
float luminance(in vec4 linear) { return luminance( linear.rgb ); }
#endif

out vec4 outColor;

ivec2 st = ivec2(gl_FragCoord.xy);
vec2 uv = gl_FragCoord.xy / GLOW_BOUNDS;

// Pack an unsigned integer into 3 8-bit channels (24 bits)
// Input value goes from 32 to 24 bit precision
vec3 packUint24(uint value){
	uint bits = value & 0xFFFFFFu;

	float r = float((bits >> 16) & 0xFFu) / 255.0;
	float g = float((bits >> 8) & 0xFFu) / 255.0;
	float b = float(bits & 0xFFu) / 255.0;

	return vec3(r, g, b);
}

// Unpack an unsigned integer from 3 8-bit channels (24 bits)
uint unpackUint24(vec3 value){
	uint r = uint(value.r * 255.0) & 0xFFu;
	uint g = uint(value.g * 255.0) & 0xFFu;
	uint b = uint(value.b * 255.0) & 0xFFu;

	return (r << 16) | (g << 8) | b;
}

// Pack a signed float into 3 8-bit channels (24 bits)
// Range is -PACK_FLOAT_RANGE/2 to +PACK_FLOAT_RANGE/2
vec3 packSnorm24(float value){
	float halfRange = PACK_FLOAT_RANGE * 0.5;
	value = clamp(value + halfRange, 0.0, PACK_FLOAT_RANGE); // Shift to unsigned range
	uint bits = uint(value * 65536.0 / PACK_FLOAT_RANGE) & 0xFFFFFFu;

	float r = float((bits >> 16) & 0xFFu) / 255.0;
	float g = float((bits >> 8) & 0xFFu) / 255.0;
	float b = float(bits & 0xFFu) / 255.0;

	return vec3(r, g, b);
}

// Unpack a signed float from 3 8-bit channels (24 bits)
float unpackSnorm24(vec3 pack){
	uint r = uint(pack.r * 255.0) & 0xFFu;
	uint g = uint(pack.g * 255.0) & 0xFFu;
	uint b = uint(pack.b * 255.0) & 0xFFu;

	uint bits = (r << 16) | (g << 8) | b;

	float halfRange = PACK_FLOAT_RANGE * 0.5;
	return (float(bits) / 65536.0 * PACK_FLOAT_RANGE) - halfRange;
}

// Pack a signed float (16 bits) and uint (8 bits) into 3 8-bit channels
// Float range is -PACK_FLOAT_RANGE/2 to +PACK_FLOAT_RANGE/2
// Uint range is 0 to 255
vec3 packSnorm16Uint8(float value, uint count){
	float halfRange = PACK_FLOAT_RANGE * 0.5;
	value = clamp(value + halfRange, 0.0, PACK_FLOAT_RANGE);
	uint floatBits = uint(value * 65535.0 / PACK_FLOAT_RANGE) & 0xFFFFu;

	float r = float((floatBits >> 8) & 0xFFu) / 255.0;
	float g = float(floatBits & 0xFFu) / 255.0;
	float b = float(count & 0xFFu) / 255.0;

	return vec3(r, g, b);
}

// Unpack a signed float (16 bits) and uint (8 bits) from 3 8-bit channels
// Returns vec2(float, count)
vec2 unpackSnorm16Uint8(vec3 pack){
	uint r = uint(pack.r * 255.0) & 0xFFu;
	uint g = uint(pack.g * 255.0) & 0xFFu;
	uint b = uint(pack.b * 255.0) & 0xFFu;

	uint floatBits = (r << 8) | g;
	float count = float(b);

	float halfRange = PACK_FLOAT_RANGE * 0.5;
	float value = (float(floatBits) / 65535.0 * PACK_FLOAT_RANGE) - halfRange;

	return vec2(value, count);
}

vec3 sample_buffer_texel(VBuffer vbuffer, ivec2 st) {
	st += ivec2(vbuffer.pos);
	return texelFetch(tex_glow_prev_frame, st, 0).rgb;
}

vec3 sample_buffer(VBuffer vbuffer, vec2 uv) {
	uv *= vbuffer.bounds / GLOW_BOUNDS;
	uv += vbuffer.pos / GLOW_SIZE;
	return texture2D(tex_glow_prev_frame, uv).rgb;
}

#define FRAME_COUNTER ivec2(430, 0)

int get_frame(){
	vec4 t = texelFetch(tex_glow_prev_frame, FRAME_COUNTER, 0);
	int frame = int(t.r * 255.0 + t.g * 255.0 * 256.0 + t.b * 255.0 * 256.0 * 256.0);
	return frame;
}

vec3 advance_frame(){
	int frame = get_frame();
	frame += 1;
	vec3 color = vec3(
		(frame % 256) / 255.0,
		(frame / 256 % 256) / 255.0,
		(frame / 256 / 256 % 256) / 255.0
	);
	return color;
}

#define R 32 // Detail vs performance tradeoff
#define RF float(R)


const uint MATERIAL_ROCK_SOIL = 0;
const uint MATERIAL_BRICK = 1;
const uint MATERIAL_SAND = 2;
const uint MATERIAL_LIQUID = 3;
const uint MATERIAL_METAL = 4;
const uint MATERIAL_GLASS_ICE_CRYSTAL = 4;
const uint MATERIAL_EMITTER_LIQUID = 14;
const uint MATERIAL_EMITTER_SOLID = 15;


// Material types
// Opaque               0
// Liquid				1
// Emissive             2
// Air or Gas           3

uint getMaterialType(vec4 color){
	uvec4 color_u = uvec4(color * 255.0);

	// Liquid. non-emissive
	if ((color_u.r & 0x80) != 0 && color.a == 1.0){
		return 1u;
	}

	// Opaque
	if((color_u.r & 0x80) != 0){
		return 0u;
	}

	// Colors that will crush to zero
	if(max(max(color_u.r, color_u.g), color_u.b) < 4u){
		return 3u;
	}

	// Alpha values between 0.0 and 1.0 are either fire particles or superbright particles
	// ALpha values of 1.0 are liquids

	// Kill superbright particles
	// TODO: Idenfity best max threshold for these
	if(color.a > 0.0 && color.a < 1.0 && max(max(color_u.r, color_u.g), color_u.b) > 31u) {
		return 3u;
	}

	// Remove dark fire particles

	// The "base" fire colors. There may be more.
	if(color_u.rgb == uvec3(7, 3, 3) || color_u.rgb == uvec3(7, 3, 1)){
		return 3u;
	}
	// Fire particles
	if(color.a > 0.0 && color.a < 1.0) {
		// Only keep colors above a certain brightness threshold
		if(luminance(color.rgb) < 0.05) {
			return 3u;
		} else {
			return 2u;
		}
	}

	// Air / Gas
	if(color.rgb == vec3(0.0)){
		return 3u;
	};

	// Emissive
	if((color_u.r & 128u) == 0u){
		return 2u;
	}

	// No material identified, default to air
	return 3u;
}

uint getMaterial(ivec2 st) {
	uint mat_here = getMaterialType(texelFetch(tex_glow_source, st, 0));

	// Only expand into air
	if(mat_here != 3u) {
		return mat_here;
	}

	// Smear emitters over a larger areas to make them easier for rays to hit
	const int EMITTER_GROW = 2;

	for(int y = -EMITTER_GROW; y <= EMITTER_GROW; y++){
		for(int x = -EMITTER_GROW; x <= EMITTER_GROW; x++){
			if(x == 0 && y == 0){
				continue;
			}
			if(getMaterialType(texelFetch(tex_glow_source, st + ivec2(x, y), 0)) == 2u){
				return 2u;
			}
		}
	}

	return mat_here;
}

float downsampleEmitters(ivec2 st){
	for(int y = st.y * 4; y < st.y * 4 + 4; y++){
		for(int x = st.x * 4; x < st.x * 4 + 4; x++){
			if(getMaterialType(texelFetch(tex_glow_source, ivec2(x, y), 0)) == 2u){
				return 1.0;
			}
		}
	}

	return 0.0;
}

uint mostCommonMaterial4x4(ivec2 st){
	uint materialCounts[16] = uint[16](0);
	for(int y = 0; y < 4; y++){
		for(int x = 0; x < 4; x++){
			ivec2 sample_st = st + ivec2(y, x);
			sample_st = clamp(sample_st, ivec2(0), ivec2(GLOW_BOUNDS));
			vec4 s = texelFetch(tex_glow_source, sample_st, 0);
			uint material = getMaterialType(s);
			// TODO: Early exit if greater than 8
			materialCounts[material]++;
		}
	}

	uint mostCommonMaterial = 0;
	uint highestCount = 0;
	for(int i = 0; i < 16; i++){
		if(materialCounts[i] > highestCount){
			highestCount = materialCounts[i];
			mostCommonMaterial = i;
		}
	}
	return mostCommonMaterial;
}

#define INV_PI 0.31830988618379067153776752674503
#define INV_SQRT_TAU 0.39894228040143267793994605993439  // 1.0/SQRT_TAU

// TODO: Separate sampler functions for each vbuffer. No need to move around
// data we don't need to.
// Interpolating sampler, excluding edges
vec3 sampleVbufferUV(VBuffer vbuffer, vec2 uv) {
	// uv = clamp(uv * 0.25, 1.0 / 431.0, 0.25 - 1.0 / 242.0);
	return texture2D(tex_glow_prev_frame, uv).rgb;
}


// ============================================================================

// outColor.rgb = texelFetch(tex_glow_source_particles, ivec2(uv * textureSize(tex_glow_source_particles, 0)), 0).rgb;

uvec3 sample_glow_source_st(ivec2 st){
	vec4 s = texelFetch(tex_glow_source, st, 0);

	// Disregard non-emissive particles. This also filters out undesired colors
	if(getMaterialType(s) != 2u) {
		return uvec3(0u);
	}

	uvec4 color_u = uvec4(s * 255.0);

    // Strip non-color bits
    color_u = color_u & 0x7F;

	// Crush from 6 bits to 4 bits
	color_u = (color_u / 4) & 0xF;

    return color_u.rgb;
}


uvec3 sample_glow_source_st_averagenxn(ivec2 st, int size){
	uvec3 sum = uvec3(0u);
	uint count = 0;
	for(int y = -size / 2; y < size / 2; y++){
		for(int x = -size / 2; x < size / 2; x++){
			ivec2 offset = ivec2(y, x);
			uvec3 s = sample_glow_source_st(st + offset);
			if(s != uvec3(0)){
				sum += s;
				count ++;
			}
		}
	}

	if(count == 0u){
		return uvec3(0u);
	}

	sum /= count;

	// if(count <= 4u) {
	// 	return uvec3(0, 15, 0);
	// 	// sum /= count;
	// }
	// return uvec3(count);

	return sum;
}


uvec3 sample_glow_source_st_maxnxn(ivec2 st, int size){
	uvec3 sum = uvec3(0u);
	for(int y = -size / 2; y < size / 2; y++){
		for(int x = -size / 2; x < size / 2; x++){
			ivec2 offset = ivec2(y, x);
			sum = max(sum, sample_glow_source_st(st + offset));
		}
	}
	return sum;
}

struct SDFSample {
	float dist;
	uint material;
};

SDFSample sample_sdf(vec2 pos) {
    vec3 s_texel = vec3(0.0);
	if(pos.y > 121.0){
		s_texel = texelFetch(tex_glow_prev_frame, ivec2(pos), 0).rgb;
	} else {
		s_texel = texelFetch(tex_glow_prev_frame, ivec2(pos) + ivec2(0, 120), 0).rgb;
	}

    float dist;
    int material = 15;

    if(pos.y > 121.0){
        material = int(s_texel.b * 255.0) & 0xF;
        dist = s_texel.g;
    } else {
        material = int(s_texel.b * 255.0) >> 4;
        dist = s_texel.r;
    }

    return SDFSample(dist, material);
}

// SDFSample sample_quarter_sdf_texel(ivec2 st) {
// 	ivec2 sample_st = ivec2(st) + ivec2(VBUF1.pos);
// 	vec3 texel = texelFetch(tex_glow_prev_frame, sample_st, 0).rgb;

// 	float dist = texel.r;
// 	uint material = uint(texel.b * 255.0);

// 	return SDFSample(dist, material);
// }

ivec2 global_st_to_vbuffer_st(ivec2 st, VBuffer vbuffer) {
	return st - ivec2(vbuffer.pos);
}

vec2 global_st_to_vbuffer_space_uv(ivec2 st, VBuffer vbuffer) {
	return vec2(st - vbuffer.pos) / vbuffer.bounds;
}

vec2 global_st_to_hdr_vbuffer_space_uv(ivec2 st, VBuffer vbuffer) {
    vec2 offset = vec2(st) - vbuffer.pos;
    offset /= vbuffer.bounds;
	return offset;
}

ivec2 uv_to_vbuffer_st(vec2 uv, VBuffer vbuffer) {
	return ivec2(vbuffer.pos + uv * vbuffer.bounds);
}

// const float BRIGHTNESS_MULTIPLIER = 1.0;
// 
// float exposureCurve(float b, float Emin, float Emax, float k){
// 	b = clamp(b, 0.0, 1.0);
// 	float num = log(1.0 + k * (1.0 - b));
// 	float den = log(1.0 + k);
// 	return mix(Emin, Emax, num / den);
// }
// 
// float exposureHDR(float L, float Emin, float Emax, float Lref, float Lhalf){
// 	L = max(L, 0.0);
// 	float safeRef = max(Lref, 1e-4);
// 	float safeHalf = max(Lhalf, 1e-4);
// 	float alpha = log(2.0) / log(1.0 + safeHalf / safeRef);
// 	float t = pow(1.0 + L / safeRef, -alpha);
// 	return mix(Emin, Emax, t);
// }
// 
// // Logistic/Hill alternative: center at Lmid with adjustable steepness
// float exposureHill(float L, float Emin, float Emax, float Lmid, float gamma){
// 	L = max(L, 0.0);
// 	float safeMid = max(Lmid, 1e-4);
// 	float t = 1.0 / (1.0 + pow(L / safeMid, gamma));
// 	return mix(Emin, Emax, t);
// }
// 
// float calculateSmoothedExposure(float currentExposure, float targetExposure){
// 	float mixed = mix(currentExposure, targetExposure, EXPOSURE_BLEND);
//         return clamp(mixed, MIN_EXPOSURE, MAX_EXPOSURE);
// }
// 
// float calculateLuminance(){
// 	float totalLogSum = 0.0;
// 
// 	for(int y = 0; y < 121; y++){
// 		float data = unpackSnorm24(texelFetch(tex_glow_prev_frame, ivec2(430, y), 0).rgb);
// 		totalLogSum += data;
// 	}
// 
// 	float avgLogLuminance = totalLogSum / 121.0;
// 	float geometricMeanLuminance = exp(avgLogLuminance) - 1.0;
// 	return min(geometricMeanLuminance, 1.0);
// }

// uint calculateTrueExposure(ivec2 st){
// 	return calculateExposure(calculateLuminance(st));
// }

bool within(VBuffer vbuffer) {
	return st.x >= vbuffer.pos.x &&
		   st.x <= vbuffer.bounds.x + vbuffer.pos.x &&
		   st.y >= vbuffer.pos.y &&
		   st.y <= vbuffer.bounds.y + vbuffer.pos.y;
}

vec3 copyBuffer(VBuffer vbuffer) {
	ivec2 index = st % ivec2(vbuffer.bounds);
	return texelFetch(tex_glow_prev_frame, ivec2(vbuffer.pos) + index, 0).rgb;
}

vec3 sample_hdr_buffer_texel(VBuffer vbuffer, ivec2 iv) {
	// Don't sample outside buffer
	iv = clamp(iv, ivec2(vbuffer.pos), ivec2(vbuffer.pos + vbuffer.bounds * 2));

	vec3 high_sample = texelFetch(tex_glow_prev_frame, iv + ivec2(0, 0), 0).rgb;
	vec3 low_sample  = texelFetch(tex_glow_prev_frame, iv + ivec2(1, 0), 0).rgb;

	uvec3 high_bits = uvec3(high_sample * 255.0) << 8;
	uvec3 low_bits = uvec3(low_sample * 255.0);
	vec3 hdr_color = vec3(high_bits | low_bits) / 255.0;
	return hdr_color;
}

vec3 sample_hdr_buffer_uninterpolated(VBuffer vbuffer, vec2 uv) {
	uv *= vec2(0.5, 1.0);
	ivec2 hdr_iv = ivec2(uv * vbuffer.bounds);
	hdr_iv *= ivec2(2, 1);
	hdr_iv += ivec2(vbuffer.pos);

	vec3 hdr_color = sample_hdr_buffer_texel(vbuffer, hdr_iv);

	return hdr_color;
}

vec3 sample_hdr_buffer(VBuffer vbuffer, vec2 uv) {
	uv *= vec2(0.5, 1.0);
	ivec2 hdr_iv = ivec2(uv * vbuffer.bounds);
	hdr_iv *= ivec2(2, 1);
	hdr_iv += ivec2(vbuffer.pos);

	vec3 hdr_color_ul = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(0, 0));
	vec3 hdr_color_ur = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(2, 0));
	vec3 hdr_color_ll = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(0, 1));
	vec3 hdr_color_lr = sample_hdr_buffer_texel(vbuffer, hdr_iv + ivec2(2, 1));

    // lerp
	vec2 f = fract(uv * vbuffer.bounds);
	vec3 hdr_color_top = mix(hdr_color_ul, hdr_color_ur, f.x);
	vec3 hdr_color_bottom = mix(hdr_color_ll, hdr_color_lr, f.x);
	vec3 hdr_color = mix(hdr_color_top, hdr_color_bottom, f.y);

	return hdr_color;
}

vec3 smartDeNoise(vec2 uv, vec2 pixel, float sigma, float kSigma, float threshold) {
    float radius = floor(kSigma*sigma + 0.5);
    float radQ = radius * radius;

    float invSigmaQx2 = 0.5 / (sigma * sigma);      // 1.0 / (sigma^2 * 2.0)
    float invSigmaQx2PI = INV_PI * invSigmaQx2;    // 1.0 / (sqrt(PI) * sigma)

    float invThresholdSqx2 = 0.5 / (threshold * threshold);  // 1.0 / (sigma^2 * 2.0)
    float invThresholdSqrt2PI = INV_SQRT_TAU / threshold;   // 1.0 / (sqrt(2*PI) * sigma)

    vec3 centrPx = sample_hdr_buffer(HDR_VBUF_0, uv);
    // vec3 centrPx = sqrt(sample_hdr_buffer(HDR_VBUF_0, uv));
	// vec3 centrPx = vec3(0.0);

    float zBuff = 0.0;
    vec3 aBuff = vec3(0.0);
    for(float x=-radius; x <= radius; x++) {
        // circular kernel
        float pt = sqrt(radQ-x*x);
        for(float y=-pt; y <= pt; y++) {
            vec2 d = vec2(x,y);

            // gaussian factor
            float blurFactor = exp( -dot(d , d) * invSigmaQx2 ) * invSigmaQx2PI;
            vec3 walkPx = sample_hdr_buffer(HDR_VBUF_0, uv+d*pixel);

            // adaptive
            vec3 dC = walkPx-centrPx;
            float deltaFactor = exp( -dot(dC, dC) * invThresholdSqx2) * invThresholdSqrt2PI * blurFactor;

            zBuff += deltaFactor;
            aBuff += deltaFactor*walkPx;
        }
    }
    return aBuff/zBuff;
}


SDFSample sample_sdf_texel(ivec2 st) {
	ivec2 offset = ivec2(0);
	if(st.y < 121){
		offset = ivec2(0, 121);
	}
	ivec2 sample_st = ivec2(st) + offset;
	vec3 texel = texelFetch(tex_glow_prev_frame, sample_st, 0).rgb;

	float dist = 0.0;
	uint material = 0u;
	if(st.y < 121){
		dist = texel.r;
		material = (uint(texel.b * 255.0) >> 6) & 0x3u;
	} else {
		dist = texel.g;
		material = (uint(texel.b * 255.0) >> 4) & 0x3u;
	}

	return SDFSample(dist, material);
}

// Finds the distance to the nearest material in the vertical direction
float distanceFieldPassVertical(ivec2 st){
	SDFSample centerSample = sample_sdf_texel(st);
	int centerDist = int(centerSample.dist * 255.0);
	uint centerMaterial = centerSample.material;
	int minDistSqr = centerDist * centerDist;

	// Down walk
	int max_y = min(int(GLOW_BOUNDS.y), st.y + centerDist);

	for(int y = st.y + 1; y <= max_y; y++) {
		SDFSample sdfSample = sample_sdf_texel(ivec2(st.x, y));
		int y_dist = y - st.y;

		if (centerMaterial != sdfSample.material) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.dist * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		// Early exit implicitally handled by max_y
		minDistSqr = min(minDistSqr, dSqr);
	}

	// Up walk
	int min_y = max(0, st.y - minDistSqr);

	for(int y = st.y - 1; y >= min_y; y--) {
		SDFSample sdfSample = sample_sdf_texel(ivec2(st.x, y));
		int y_dist = y - st.y;

		if (centerMaterial != sdfSample.material) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.dist * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		minDistSqr = min(minDistSqr, dSqr);
	}

	float dist = sqrt(float(minDistSqr));

	return dist / 255.0;
}

float emitterDistanceFieldPassVertical(ivec2 st){
	vec3 centerSample = texelFetch(tex_glow_prev_frame, st, 0).rgb;
	int centerDist = int(centerSample.g * 255.0);
	int minDistSqr = centerDist * centerDist;

	// Down walk
	int max_y = min(59, st.y + centerDist);

	for(int y = st.y + 1; y <= max_y; y++) {
		vec3 sdfSample = texelFetch(tex_glow_prev_frame, ivec2(st.x, y), 0).rgb;
		int y_dist = y - st.y;

		if (centerSample.r != sdfSample.r) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.g * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		// Early exit implicitally handled by max_y
		minDistSqr = min(minDistSqr, dSqr);
	}

	// Up walk
	int min_y = max(0, st.y - minDistSqr);

	for(int y = st.y - 1; y >= min_y; y--) {
		vec3 sdfSample = texelFetch(tex_glow_prev_frame, ivec2(st.x, y), 0).rgb;
		int y_dist = y - st.y;

		if (centerSample.r != sdfSample.r) {
			minDistSqr = min(minDistSqr, y_dist * y_dist);
			break;
		}

		int x_dist = int(sdfSample.g * 255.0);
		int dSqr = y_dist * y_dist + x_dist * x_dist;
		minDistSqr = min(minDistSqr, dSqr);
	}

	float dist = sqrt(float(minDistSqr));

	return dist / 255.0;
}


// Color data is only 4 bits per channel, so we store 2 colors per pixel
vec3 store_color(ivec2 vbuf_st){
	// Here we are doing a 2x downscale, while also cutting off the top and bottom rows.
	// The top and bottom rows are compressed into the edges.
	ivec2 scaled_st = vbuf_st * 2;
	scaled_st += ivec2(0, 2); // 2 to account for the * 2 in prev step

    ivec2 color_0_st = scaled_st;
    ivec2 color_1_st = scaled_st + ivec2(0, 120);


	// A large area needs to be covered so that the top and bottom rows are able to
	// capture the color from the top 2 and bottom 2 rows of the source buffer. This also
	// reduces the chance of color lookups missing.
	// TODO: This only needs to be done for the edges, saving a lot of texture lookups
	int size_0 = 8;
	int size_1 = 8;

	uvec3 color_0 = sample_glow_source_st_averagenxn(color_0_st, size_0) & 0xF;
	uvec3 color_1 = sample_glow_source_st_averagenxn(color_1_st, size_1) & 0xF;

	// Test pattern should appear magenta
	// color_0 = uvec3(15u, 15u, 0u);
	// color_1 = uvec3(0u, 15u, 15u);

    uvec3 pack = uvec3(
        color_0.r << 4 | color_0.g,
        color_0.b << 4 | color_1.r,
        color_1.g << 4 | color_1.b
    );

    return vec3(pack) / 255.0;
}

vec2 vbuffer_st_to_vbuffer_uv(ivec2 st, VBuffer vbuffer) {
    return vec2(st) / vbuffer.bounds;
}

float sample_emitter_sdf(vec2 uv) {
	return texelFetch(tex_glow_prev_frame, ivec2(uv * vec2(107, 59)) + ivec2(215, 0), 0).b;
}


// TODO: Optimisation
// Ensure each vbuffer that needs to do heavy texture lookups start at an even offset to ensure they land in the same quad group.
void main(){
	outColor = vec4(0.0, 0.0, 0.0, 1.0);

	if (st == FRAME_COUNTER) {
		outColor.rgb = advance_frame();
	}

    if (within(VBUF_COLOR_0)) {
        ivec2 color_st = global_st_to_vbuffer_st(st, VBUF_COLOR_0);
		// We spread source colors over a larger area to ensure they are captured in the downsampled buffers,
		// and to prevent rays missing colors when they sample.
        outColor.rgb = store_color(color_st);
		// outColor.rgb = vec3(1.0, 0.0, 0.0);
		// outColor.rgb = vec3(vec2(color_st) / VBUF_COLOR_0.bounds, 0.0);
    }

    if (within(VBUF_COLOR_1)) {
		// outColor.rgb = vec3(0.0, 1.0, 0.0);
		// return;
        ivec2 color_st = global_st_to_vbuffer_st(st, VBUF_COLOR_1);
        outColor.rgb = sample_buffer_texel(VBUF_COLOR_0, color_st);
    }

	if (within(SDF)) {
		ivec2 sdf_st = global_st_to_vbuffer_st(st, SDF);

		// Bits:
		//   - 0-1: Current material for upper half of screen
		//   - 2-3: Current material for lower half of screen
		//   - 4-5: Previous material for upper half of screen
		//   - 6-7: Previous material for lower half of screen
		uint materialUpper = getMaterial(sdf_st);
		uint materialLower = getMaterial(sdf_st + ivec2(0, GLOW_BOUNDS.y / 2.0));
		uint currentMaterials = materialUpper << 2 | materialLower;

		vec3 previousFrame = texelFetch(tex_glow_prev_frame, st, 0).rgb;
		uint previousMaterials = uint(previousFrame.b * 255.0) >> 4 & 0xF;
		uint combinedMaterials = currentMaterials << 4 | previousMaterials;

		float materials = float(combinedMaterials) / 255.0;


		// Pipeline step 2a
		//   - SDF Second pass (vertical)

		float distUpper = distanceFieldPassVertical(sdf_st + ivec2(0, -1));
		float distLower = distanceFieldPassVertical(sdf_st + ivec2(0, 120));

		outColor.rgb = vec3(
			distUpper,
			distLower,
			materials
		);
	}


	if (within(EMITTER_SDF)) {
		ivec2 sdf_st = global_st_to_vbuffer_st(st, EMITTER_SDF);
		float downsampled_emitter = downsampleEmitters(sdf_st);
		float dist = emitterDistanceFieldPassVertical(st);

		vec3 prev_frame = texelFetch(tex_glow_prev_frame, st, 0).rgb;

		outColor.rgb = vec3(
			downsampled_emitter,
			prev_frame.g,
			dist
		);
	}


	if (within(HDR_VBUF_0)) {

        ivec2 hdr_st = global_st_to_vbuffer_st(st, HDR_VBUF_0);
		ivec2 snap_st = ivec2(hdr_st.x & ~1, hdr_st.y);
		vec2 uv = vbuffer_st_to_vbuffer_uv(snap_st, HDR_VBUF_0);

		vec3 glow = sample_hdr_buffer(HDR_VBUF_0, uv);

		// const float sigma = 4.0;
		// const float kSigma = 0.8;
		// const float threshold = 2.4;

		// const float sigma = 4.0;
		// const float kSigma = 1.0;
		// const float threshold = 8.0;

		// const float sigma = 3.0;
		// const float kSigma = 1.0;
		// const float threshold = 8.0;

		float sigma = 3.0;
		float kSigma = 1.0;

		vec2 pixel = vec2(1.0) / vec2(107.0, 60.0);

		float emitter_dist = sample_emitter_sdf(uv) * 255.0;
		float dist = sample_sdf(uv * GLOW_BOUNDS).dist;

		float threshold_base = 8.0;

		float threshold_emitter = threshold_base;
		float threshold_dist = threshold_base;

		// Attempt to mitigate aliasing
		// There is likely a way to calculate ideal threshold values here, but I've just eyeballed it
		if(emitter_dist == 1.0) {
			threshold_emitter = 36.0;
		}

		if(emitter_dist == 2.0) {
			threshold_emitter = 30.0;
		}

		if(emitter_dist == 3.0) {
			threshold_emitter = 25.0;
		}


		float threshold = max(threshold_emitter, threshold_dist);

		glow = smartDeNoise(uv, pixel, sigma, kSigma, threshold);

		// if(emitter_dist == 1.0) {
		// 	glow *= 0.25;
		// }

		// if(emitter_dist == 2.0) {
		// 	glow *= 0.5;
		// }

		// if(emitter_dist == 3.0) {
		// 	glow *= 0.75;
		// }


		uvec3 glow_bits = uvec3(glow * 255.0);
        if ((hdr_st.x & 1) == 0) {
			// High bits
            glow = vec3((glow_bits >> 8) & 0xFFu) / 255.0;
        } else {
			// Low bits
            glow = vec3(glow_bits & 0xFFu) / 255.0;
        }

        outColor.rgb = glow;

		// Skip denoising
		// outColor.rgb = texelFetch(tex_glow_prev_frame, st, 0).rgb;
    }
}
