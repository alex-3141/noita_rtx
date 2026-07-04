// REPLACE #version 110
#version 130
// END
#define DITHER
#define HIQ
//extra_define0

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

varying vec2 tex_coord_;
varying vec2 tex_coord_y_inverted_;
varying vec2 tex_coord_glow_;
varying vec2 world_pos;
varying vec2 tex_coord_skylight;
varying vec2 tex_coord_fogofwar;

// INSERT_BEFORE
// // -----------------------------------------------------------------------------------------------
// // utilities
// START
// Noita RTX ========================================================================================
// ==================================================================================================

const vec2 SCREEN_SIZE = vec2(431.0, 242.0);

// Lygia includes
#undef DIGITS_SIZE
#define DIGITS_SIZE vec2(0.25)
#include "../lygia/draw/digits.glsl"
#define TONEMAP_FNC tonemapUncharted
#include "../lygia/color/tonemap.glsl"
#include "../lygia/color/space/srgb2rgb.glsl"
#include "../lygia/color/space/rgb2srgb.glsl"

// COMMON

uniform sampler2D RL_tex_lights;
uniform sampler2D RL_tex_lights_list;
uniform sampler2D RL_tex_lights_cells;
uniform sampler2D RL_tex_df;
uniform vec4 RL_light_count;
uniform vec4 RL_time;
uniform vec4 RL_data;
uniform vec4 RTX_exposure_ambient_dust;
uniform vec4 camera_delta;
uniform vec4 player_pos;

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

#define K_CLEAR 0.002

vec3 cast_ray_point(in vec2 pos, in vec2 target, in vec3 target_color){
	target = clamp(target, vec2(0.0), GLOW_BOUNDS);
	vec2 dir = normalize(target - pos);
	float dist =  distance(pos * GLOW_BOUNDS, target);
	float distToTarget = distance(pos, target);

	float dt = 0.0;
	float rayIntensity = 1.0;

	const int STEPS = 48;
	bool target_reached = false;

	for(int j = 0; j < STEPS; j++){
		vec2 next_pos = pos + dir * dt;

		// Sample SDF and material info
		SDFSample sdfSample = sample_sdf_texel(ivec2(next_pos));
		float d = sdfSample.dist * 255.0;

		float occlusionFactor = materialOcclusionFactor(sdfSample.material);

		if(dt + d > distToTarget){
			rayIntensity *= pow(occlusionFactor, distToTarget - dt);
			target_reached = true;
			break;
		} else {
			rayIntensity *= pow(occlusionFactor, d);
			dt += max(d, 0.5);
		}
	}

	// Default to full occlusion if target isn't reached
	if (!target_reached) {
		rayIntensity = 0.0;
	}

	float geometricFalloff = 1.0 / (1.0 + K_CLEAR * distToTarget * distToTarget);
	return target_color * rayIntensity * geometricFalloff;
}

int rtx_bitCount(int bits) {
	int count = 0;

	while (bits > 0) {
		count += bits & 1;
		bits = bits >> 1;
	}

	return count;
}

vec4 rtx_debug_light_count(in vec2 uv){
	ivec2 cell_coord = ivec2(uv * textureSize(RL_tex_lights_cells, 0));

	vec4 texel = texelFetch(RL_tex_lights_cells, cell_coord, 0);

	float count = texel.g * 255.0;

	// return vec4(vec3(count) / 255.0, 1.0);

	vec2 local_uv = mod(uv * vec2(430.0, 242.0), 16.0) / 16.0;

	// return vec4(local_uv, 0.0, 1.0);

	vec3 digit = vec3( digits( local_uv, count, 0.0, 0.0));

	vec3 color = step(0.01, count) * digit * vec3(1.0, 0.0, 0.0);

	return vec4(color, color == vec3(0.0) ? 0.0 : 1.0);
}


struct Light {
	vec3 color;
	vec2 pos;
};

Light getLightHigh(in uint index) {
	uvec4 texel_0 = uvec4(texelFetch(RL_tex_lights, ivec2(index, 0), 0) * 255.0);
	uvec4 texel_1 = uvec4(texelFetch(RL_tex_lights, ivec2(index, 1), 0) * 255.0);

	float r = float(texel_0.r | texel_0.g << 8 & 0xF00u) / 255.0;
	float g = float(texel_0.g >> 4 | texel_0.b << 4) / 255.0;
	float b = float(texel_0.a | texel_1.r << 8 & 0xF00u) / 255.0;

	float x = float(texel_1.r >> 4 | texel_1.g << 4) / 4095.0;
	float y = float(texel_1.b | texel_1.a << 8) / 4095.0;

	return Light (vec3(r, g, b), vec2(x, y));
}

// TODO: Low precision version that uses 1 pixel
//       R: 4 bits
//       G: 4 bits
//       B: 4 bits
//       X: 10 bits
//       Y: 10 bits
Light getLightLow(in uint index) {
	vec3 color = vec3(0.0);

	vec2 pos = vec2(0.0);

	return Light (color, pos);
}

vec3 getPointLightSources(in vec2 uv){
	vec3 accumulated_light = vec3(0.0);
	uint light_count = uint(RL_data.z);
	vec2 subpixel_offset = fract(camera_pos.xy) / GLOW_BOUNDS;

	// Convert into SDF space
	vec2 pos = (vec2(uv.x, 1.0 - uv.y) + subpixel_offset) * GLOW_BOUNDS;

	for(uint i = 0u; i < light_count; i++) {
		Light light = getLightHigh(i);
		light.pos += subpixel_offset;
		light.pos *= GLOW_BOUNDS;

		vec3 point_light = cast_ray_point(pos, light.pos, light.color);

		// Depth hinting

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

	return accumulated_light;
}

vec3 rtx_debug_light_positions(in vec2 uv){
	vec3 color = vec3(0.0);
	uint light_count = uint(RL_data.z);
	vec2 subpixel_offset = fract(camera_pos.xy) / SCREEN_SIZE;
	uv += subpixel_offset;
	vec2 frag = 1.0 / window_size;

	for(uint i = 0u; i < light_count; i++) {
		Light light = getLightHigh(i);
		light.pos += subpixel_offset;
		vec2 diff = (light.pos - uv) * vec2(SCREEN_SIZE.x / SCREEN_SIZE.y, 1.0);

		if(length(diff) < 0.025 && (abs(diff.x) <= frag.x || abs(diff.y) <= frag.y)) {
			color += vec3(1.0, 1.0, 1.0);
		}
	}

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

	uvec3 smp = uvec3(sample_buffer_texel(VBUF_COLOR_1, color_st) * 255.0) & 0xFFu;

    uvec3 color_u = uvec3(0u);

    if(top){
        color_u = uvec3(
            smp.g,
            smp.b >> 4u,
            smp.b
        );
    } else {
        color_u = uvec3(
            smp.r >> 4u,
            smp.r,
            smp.g >> 4u
        );
    }

    color_u = color_u & 0xFu;

    vec3 color = vec3(color_u << 4u) / 255.0;

	// if (color == vec3(0.0)) {
	// 	return vec3(vec2(st) / VBUF_SIZE,  0.0);
	// }

    return color;
}

vec3 sample_emitter_color(vec2 uv) {
    ivec2 emitter_st = ivec2(uv * GLOW_BOUNDS);
	vec3 smp = sample_emitter_color_texel(emitter_st);
	return smp;
}

uvec3 sample_glow_source_st(ivec2 st){
	uvec3 color_u = uvec3(texelFetch(tex_glow_unfiltered, st, 0).rgb * 255.0);

	// Non-glow materials
	if((color_u.r & 0x80u) != 0u){
		return uvec3(0);
	}

	// Kill superbright particles
	// uint maxChannel = max(color_u.r, max(color_u.g, color_u.b));
	// if(maxChannel > 0xFu){
	// 	color_u >>= 4u;
	// }

    // Strip non-color bits
    // color_u = color_u & 0xFu;

	// Bring back into original range
	// color_u *= 4u;

    return color_u;
}

vec3 rtx_compute_light(in vec2 tex_coord, in vec2 tex_coord_glow){
	vec3 summed_light = vec3(0.0);

	vec3 point_light = getPointLightSources(tex_coord);
	vec2 coord_glow_compensated = tex_coord_glow + camera_compensation() / GLOW_BOUNDS;
	// vec3 glow_light = sample_hdr_buffer(HDR_VBUF_0, coord_glow_compensated);
	vec3 glow_light = sample_hdr_buffer_gaussian_5x5(HDR_VBUF_0, coord_glow_compensated);
	// vec3 glow_light = sample_hdr_buffer_gaussian_3x3(HDR_VBUF_0, coord_glow_compensated);
	// vec3 glow_light = sample_hdr_buffer_uninterpolated(HDR_VBUF_0, coord_glow_compensated + 1.0 / GLOW_SIZE);

	float ambient = RTX_exposure_ambient_dust.y;

	// Light multipliers. These should balance all light sources to a common standard candle at 1.0 exposure
	const float point_mul = 20.0;
	const float glow_mul = 0.25;

	point_light *= point_mul;
	glow_light *= glow_mul;

	// Linear summation
	summed_light += ambient;
	summed_light += point_light;
	summed_light += glow_light;

	return summed_light;
}

// Multiply with scene and composite
vec3 rtx_composite(in vec4 fg_srgb, in vec3 bg_srgb, in vec4 fog, in vec3 light){
	fg_srgb.rgb = mix(fg_srgb.rgb, fog.rgb, fog.a);
	fg_srgb.a += (1.0 - fg_srgb.a) * fog.a;

	vec4 fg = vec4( srgb2rgb(fg_srgb.rgb), fg_srgb.a);
	vec3 bg = srgb2rgb(bg_srgb);

	fg.rgb *= light;

	vec3 composited = mix(bg, fg.rgb, fg.a);

	float dust = RTX_exposure_ambient_dust.z;

	// Additive light

	// Flat dust amount to make light more visible on dark backgrounds
	composited += light * dust;
	// Shift the final color towards the fog color
	composited = mix(composited, fog.rgb, fog.a * 0.1);

	return composited;
}

vec3 rtx_tonemap(in vec3 composited){
	float exposure = RTX_exposure_ambient_dust.x;
	vec3 tonemapped = tonemap(composited * exposure);
	return tonemapped;
}

vec3 rtx_debug(in vec3 color){
	vec2 uv = vec2(tex_coord_.x, 1.0 - tex_coord_.y);
	// ================ Buffer visualisations ================

	// // Glow buffer
	// color = texelFetch(tex_glow, ivec2((uv) * GLOW_SIZE), 0).rgb;

	// Source glow buffer
	// color = texelFetch(tex_glow_unfiltered, ivec2((uv) * GLOW_SIZE), 0).rgb * 4.0;

	// #define VISUAL_SDF
	// #define VISUAL_EMITTER
	// #define VISUAL_EMITTER_FILL
	// #define VISUAL_MATERIAL
	// #define VISUAL_EMITTER_COLOR

	// ================ SDF Ring visualisation ================

	#ifdef VISUAL_SDF
	SDFSample sdf = sample_sdf_texel(ivec2(uv * GLOW_BOUNDS));
	uint dist = uint(sdf.dist * 255.0);
	float ring = ((dist & 3u) == 0u) ? (1.0 - sdf.dist * 3.0) * 0.3 : 0.0;
	color = mix(color, vec3(0.0, 1.0, 1.0), max(0.0, ring));
	#endif


	// ================ Emissive pixel visualisation ================
	#ifdef VISUAL_EMITTER
	bool emitter_here = sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS)) == 2u;
	#ifdef VISUAL_EMITTER_FILL
	if(emitter_here){
		color = vec3(0.0, 1.0, 1.0);
	}
	#else
	bool emitter_side = (
		sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2( 1,  1)) == 2u ||
		sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2(-1,  1)) == 2u ||
		sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2( 1, -1)) == 2u ||
		sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS) + ivec2(-1, -1)) == 2u
	);
	if(!emitter_here && emitter_side) {
		color = vec3(0.0, 1.0, 1.0);
	} else if(emitter_here) {
		color = sample_emitter_color(tex_coord_glow_);
	}
	#endif
	#endif


	// ================ Material visualisation ================
	#ifdef VISUAL_MATERIAL
	uint mat = sampleMaterial(ivec2(tex_coord_glow_ * GLOW_BOUNDS));
	if(mat == 0u) {
		color = vec3(0.7, 0.0, 0.0);
	}
	if(mat == 1u) {
		color = vec3(0.0, 0.7, 0.0);
	}
	if(mat == 2u) {
		color = vec3(0.0, 0.0, 0.7);
	}
	if(mat == 3u) {
		color = vec3(0.7, 0.0, 0.7);
	}
	#endif


	// ============= Emitter color visualisation ==============
	#ifdef VISUAL_EMITTER_COLOR
	color = sample_emitter_color(uv);
	#endif

	return color;
}
// END

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

void main()
{
	// constants
	const bool ENABLE_REFRACTION 			= 1>0;
	const bool ENABLE_LIGHTING	    		= 1>0;
	const bool ENABLE_FOG_OF_WAR 			= 1>0;
// REPLACE 	const bool ENABLE_GLOW 					= 1>0;
	const bool ENABLE_GLOW 					= 1>1;
// END
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

// ==========================================================================================================
// fetch texture coords etc =============================================================================

	vec2 tex_coord = tex_coord_;
	vec2 tex_coord_y_inverted = tex_coord_y_inverted_;
	vec2 tex_coord_glow = tex_coord_glow_;

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

	vec2 pos_seed = vec2(camera_pos.x / SCREEN_W, camera_pos.y / SCREEN_H) + vec2( tex_coord.x, - tex_coord.y );

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
			const float GLOW_BLUR_OFFSET  = 0.0025 * 0.5;
			const float GLOW_BLUR_OFFSET2 = 0.004  * 0.5;

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
			//glow = max( vec3(0.0), glow - vec3(1.0/128.0) );
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
// REPLACE 	vec3 lights = light_tex_sample.rgb * 0.8;
	vec3 rtx_lights = rtx_compute_light(tex_coord, tex_coord_glow);
	vec3 lights = rtx_lights;
// END

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
// REPLACE
// 		vec2 FOG_TEX_SIZE = vec2( 64.0 ) * camera_inv_zoom_ratio;
// 
// 		vec4 fog_value = texture2D( tex_fog, tex_coord_fogofwar );
// 
// 		#ifdef HIQ
// 			const float s  = 0.25;
// 			const float s2 = 0.75;
// 			fog_value = fog_value + (
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )
// 
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,0.0) /  FOG_TEX_SIZE.x * s2 )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,0.0) /  FOG_TEX_SIZE.y * s2 )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(0.0,1.0) /  FOG_TEX_SIZE.x * s2 )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(0.0,1.0) /  FOG_TEX_SIZE.y * s2 ) );
// 		    fog_value *= 0.1111111;
// 		#else
// 			const float s = 0.5;
// 			fog_value = fog_value + (
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar - vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(-1.0,1.0) / FOG_TEX_SIZE.x * s )
// 	                           + texture2D(tex_fog, tex_coord_fogofwar + vec2(1.0,1.0) /  FOG_TEX_SIZE.y * s ) );
// 		    fog_value *= 0.2;
// 		#endif
// START
		vec2 pixel = 1.0 / (vec2( 64.0 ) * camera_inv_zoom_ratio);

		// 3x3 gaussian
		vec4 fog_value = vec4(0.0);
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(-1, -1)) * 0.0625;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(0, -1)) * 0.125;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(1, -1)) * 0.0625;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(-1, 0)) * 0.125;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(0, 0)) * 0.25;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(1, 0)) * 0.125;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(-1, 1)) * 0.0625;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(0, 1)) * 0.125;
		fog_value += texture2D(tex_fog, tex_coord_fogofwar + pixel * vec2(1, 1)) * 0.0625;
// END

		fog_of_war_amount = fog_value.r * (1.0-light_tex_sample.a); // light_tex_sample.a contains "fog of war holes" (for example temporary holes caused by explosions)
		dust_amount = fog_value.g;
	}

// ============================================================================================================
// get sky light color ========================================================================================
	
// DELETE
// 	lights = pow( lights, vec3( 1.5 ) );
// 
// 	// apply light from the glow buffer ---
// 	lights += glow; 
// END

	vec3 sky_light = sky_light_color.rgb * sky_ambient_amount;

// REPLACE
// 	// apply light from the sky ---
// 	//sky_ambient_amount = max(0.0,sky_ambient_amount);
// 	lights -= sky_light;
// 	lights = max(lights,vec3(0.0));
// 	lights += sky_light;
// 	lights = min( lights, vec3(1.0) );
// 
// 	// correct the gamma
// 	if (ENABLE_GAMMA_CORRECTION)
// 		lights = pow(lights, vec3(1.0 / 2.2));
// 
// 	lights = dither_srgb(lights, noise.g, 128.0);
// START
	lights += srgb2rgb(sky_light);
// END
	
// ==========================================================================================================
// fog of war ================================================================================================

	float fog_of_war_sky_ambient_amount = sky_ambient_amount;
	float fade = clamp( (world_pos.y - 250.0) / 100.0, 0.0, 1.0 );
	fog_of_war_sky_ambient_amount *= 1.0-fade;
	float sky_ambient2 = sqrt( fog_of_war_sky_ambient_amount );
// REPLACE 	vec3 fog_of_war = 1.4 * vec3(0.6,0.5,0.45) * vec3( max( 0.0, 1.0 - fog_of_war_amount - sky_ambient2 ) );
	vec3 fog_of_war = 0.7 * vec3( max( 0.0, 1.0 - fog_of_war_amount - sky_ambient2 ) );
// END
	// fog_of_war = min( vec3(1.0), max( dither_srgb( 1.1 * fog_of_war, noise.b, 32.0 ), fog_of_war_sky_ambient_amount ) );
	// fog_of_war = pow( fog_of_war, vec3( 0.6 ) );
	fog_of_war = min( vec3(1.0), max( dither_srgb( 2.0 * fog_of_war, noise.b, 32.0 ), fog_of_war_sky_ambient_amount ) );

// DELETE 	lights *= fog_of_war;
// END
// DELETE  	lights += max(0.35 - fog_of_war_sky_ambient_amount, 0.0) * dither_srgb( fog_of_war, noise.b, 128.0 );
// END

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
// We do this ourselvess during compositing
// DELETE
// 	color = mix(color, fog_color_bg, fog_amount_background);
// 	color = mix(color , dither_srgb(color, noise.a, 64.0 ), fog_amount );
// END

// ==========================================================================================================
// nightvision ==============================================================================================

	float edge_dist = length(tex_coord - vec2(0.5)) * 2.0;
	float edge_dist_inv = 1.0 - edge_dist;
	lights += vec3(edge_dist_inv * drugged_nightvision_amount);
	edge_dist = clamp( edge_dist, 0.0, 1.0 );

// ==========================================================================================================
// blend foreground and background ==========================================================================

	// reverse the blending effects applied when composing foreground layers
// REPLACE
// 	color_fg.a   = pow(color_fg.a, 0.5);
// 	color_fg.rgb = color_fg.rgb * ( 1.0 / color_fg.a );
// 	color_fg.rgb = clamp(color_fg.rgb, vec3(0.0,0.0,0.0), vec3(1.0,1.0,1.0));
// START
	// Avoid UB
	if (color_fg.a > 0.0 && color_fg.a < 1.0) {
		color_fg.a   = sqrt(color_fg.a);
		color_fg.rgb = color_fg.rgb * ( 1.0 / color_fg.a);
	}
// END


	// apply the lighting to the foreground
// DELETE
// 	if (ENABLE_LIGHTING)
// 		color_fg.rgb *= lights;
// END

	// fog
// REPLACE
// 	color_fg.rgb = mix( color_fg.rgb, fog_color_fg.rgb, fog_amount_fg * fog_amount_multiplier_final );
// 
// 	// combine foreground and background
// 	// NOTE( Petri ): Apparently the sky can sometimes be black and color_fg.a being 0 is at fault for that
// 	// Credit to Noita community for finding this bug.
// 	if( color_fg.a == 0.0 ) {
// 		color = color;
// 	} else {
// 		color = color_fg.rgb * color_fg.a + color * (1.0-color_fg.a);
// 	}
// START
	vec4 rtx_fog = vec4(fog_color_fg.rgb, fog_amount_fg * fog_amount_multiplier_final);
	// "color" is background layer, and becomes the combined composite after this line
	color = rtx_composite(color_fg, color, rtx_fog, lights);
// END

// ============================================================================================================
// color correction effect ====================================================================================
// INSERT_AFTER // color correction effect ====================================================================================
	// Tonemap
	color = rtx_tonemap(color);
	// Convert back to SRGB. The color grading after this step would be authored in SRGB space.
	color = rgb2srgb(color);
	// Non-diagetic effects
	color *= fog_of_war;
// END

	color = mix(color, vec3((color.r + color.g + color.b) * 0.3333), color_grading.a);
	color = color * color_grading.rgb;
	vec3 color2 = color;
	//color = mix(color2, color, clamp( color_grading.a - glow * 3.0, 0.0, 1.0 ) ); // min(sqrt(sky_ambient_amount) * 5.0, 1.0) - glow * 3.0);

// ============================================================================================================
// apply glow effect using a variation of screen blending. the glow is reduced on areas with bright sky light =

// DELETE
// 	if (ENABLE_GLOW)
// 	{
// 		vec3 sky_light_modulation = max( vec3(1.0 - sky_ambient_amount), sky_light_color.rgb );
// 		glow *= fog_of_war;
// 		color = max ( color + glow * 0.6 - 0.6 * lights, clamp((color + glow) - ( color * sky_light_modulation * glow), 0.0, 1.0));
// 	}
// END

// ==========================================================================================================
// damage flash effect ======================================================================================

	color = mix( color, vec3(1.0,0.0,0.0), damage_flash_interpolation * edge_dist * 0.7 );

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
	color.rgb = mix( color, additive_overlay_color.rgb, additive_overlay_color.a );

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

	color.rgb = mix( color, overlay_color.rgb, overlay_color.a );
	color.rgb = mix( color, overlay_color_blindness.rgb, overlay_color_blindness.a * 0.5 + overlay_color_blindness.a * edge_dist*edge_dist * 40.0);

// ============================================================================================================
// low health indicator =======================================================================================
{
	float a = length(tex_coord - vec2(0.5,0.5));
	a *= 1.3;
	a *= a;
	a *= a;
	color += LOW_HEALTH_INDICATOR_COLOR * a * low_health_indicator_alpha;
}

// ============================================================================================================
// various debug visualizations================================================================================

// INSERT_AFTER // various debug visualizations================================================================================
	// color += rtx_debug_light_count(tex_coord).rgb;
// END

	//color.r += 1.0 - fog_of_war.r;

	//#define DEBUG_SKYLIGHT
	//#define DEBUG_NOISE
	//#define DEBUG_DEBUG
	#ifdef HIQ
		#define DEBUG_PATHFINDING
	#endif

	vec2 tex_coord_debug = tex_coord_.xy;

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

	//color.r = tex_coord_warped_lerp;
	gl_FragColor.rgb  = color;
	gl_FragColor.a = 1.0;
// INSERT_AFTER gl_FragColor.a = 1.0;
	// gl_FragColor.rgb += texture2D(RL_tex_lights_cells, tex_coord).rgb * 8.0;
	// gl_FragColor.rgb = rgb2srgb(getPointLightSources(tex_coord));
	// if(int(floor(tex_coord.x * 100.0)) % 2 == 0) {
	// if(tex_coord.x > 0.5) {
		// gl_FragColor.rgb = tonemap(rtx_lights);
		// gl_FragColor.rgb = rtx_lights;
		// gl_FragColor.rgb = rtx_debug(gl_FragColor.rgb);
	// }
	// gl_FragColor.rgb += rtx_debug_light_positions(tex_coord).rgb;
// END
}