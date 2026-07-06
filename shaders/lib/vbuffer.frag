#ifndef INCLUDE_VBUFFER
#define INCLUDE_VBUFFER
// TOTAL BUFFER SIZE: 431x242
// QUARTER RES VBUFFER SIZE: 107x60
// LAYOUT:
//     X: 107, 107, 107, 107, 2
//     Y: 60, 60, 1, 121

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

bool within(VBuffer vbuffer) {
	return st.x >= vbuffer.pos.x &&
		   st.x <= vbuffer.bounds.x + vbuffer.pos.x &&
		   st.y >= vbuffer.pos.y &&
		   st.y <= vbuffer.bounds.y + vbuffer.pos.y;
}

ivec2 global_st_to_vbuffer_st(ivec2 st, VBuffer vbuffer) {
	return st - ivec2(vbuffer.pos);
}

vec2 global_st_to_vbuffer_space_st(ivec2 st, VBuffer vbuffer) {
	return vec2(st - vbuffer.pos) / vbuffer.bounds;
}

vec3 sample_buffer_texel(VBuffer vbuffer, ivec2 st) {
	st += ivec2(vbuffer.pos);
	return texelFetch(BUFFER, st, 0).rgb;
}

vec2 global_st_to_hdr_vbuffer_space_uv(ivec2 st, VBuffer vbuffer) {
    vec2 offset = vec2(st) - vbuffer.pos;
    offset /= vbuffer.bounds;
	return offset;
}

vec2 vbuffer_st_to_vbuffer_uv(ivec2 st, VBuffer vbuffer) {
    return vec2(st) / vbuffer.bounds;
}

vec3 sample_buffer(VBuffer vbuffer, vec2 uv) {
	uv *= vbuffer.bounds / GLOW_BOUNDS;
	uv += vbuffer.pos / GLOW_SIZE;
    return texture2D(BUFFER, uv).rgb;
}

vec3 sample_hdr_buffer_texel(ivec2 st) {
	// Don't sample outside buffer
	st = clamp(st, ivec2(HDR_VBUF_0.pos) - ivec2(-2, -1), ivec2(HDR_VBUF_0.pos + HDR_VBUF_0.bounds - ivec2(3, 1)));

	vec3 high_sample = texelFetch(BUFFER, st + ivec2(0, 0), 0).rgb;
	vec3 low_sample  = texelFetch(BUFFER, st + ivec2(1, 0), 0).rgb;

	uvec3 high_bits = uvec3(high_sample * 255.0) << 8;
	uvec3 low_bits = uvec3(low_sample * 255.0);
	vec3 hdr_color = vec3(high_bits | low_bits) / 255.0;
	return hdr_color;
}

vec3 sample_hdr_buffer(vec2 uv) {
	uv *= vec2(0.5, 1.0);
	ivec2 hdr_st = ivec2(uv * HDR_VBUF_0.bounds);
	hdr_st *= ivec2(2, 1);
	hdr_st += ivec2(HDR_VBUF_0.pos);

	vec3 hdr_color_ul = sample_hdr_buffer_texel(hdr_st + ivec2(0, 0));
	vec3 hdr_color_ur = sample_hdr_buffer_texel(hdr_st + ivec2(2, 0));
	vec3 hdr_color_ll = sample_hdr_buffer_texel(hdr_st + ivec2(0, 1));
	vec3 hdr_color_lr = sample_hdr_buffer_texel(hdr_st + ivec2(2, 1));

    // lerp
	vec2 f = fract(uv * HDR_VBUF_0.bounds);
	vec3 hdr_color_top = mix(hdr_color_ul, hdr_color_ur, f.x);
	vec3 hdr_color_bottom = mix(hdr_color_ll, hdr_color_lr, f.x);
	vec3 hdr_color = mix(hdr_color_top, hdr_color_bottom, f.y);

	return hdr_color;
}

vec3 sample_hdr_buffer_gaussian_3x3(vec2 uv) {
	vec2 pixel = 1.0 / (HDR_VBUF_0.bounds * vec2(1.0, 2.0));

	vec3 hdr_color = vec3(0.0);
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, -1)) * 0.125;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, 0)) * 0.125;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, 0)) * 0.25;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, 0)) * 0.125;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, 1)) * 0.125;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, 1)) * 0.0625;

	return hdr_color;
}

vec3 sample_hdr_buffer_gaussian_5x5(vec2 uv) {
	vec2 pixel = 1.0 / (HDR_VBUF_0.bounds * vec2(1.0, 2.0));

	vec3 hdr_color = vec3(0.0);
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-2, -2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, -2)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, -2)) * 0.0234375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, -2)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(2, -2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-2, -1)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, -1)) * 0.09375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, -1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(2, -1)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-2, 0)) * 0.0234375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, 0)) * 0.09375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, 0)) * 0.140625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, 0)) * 0.09375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(2, 0)) * 0.0234375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-2, 1)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, 1)) * 0.09375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, 1)) * 0.0625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(2, 1)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-2, 2)) * 0.00390625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(-1, 2)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(0, 2)) * 0.0234375;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(1, 2)) * 0.015625;
	hdr_color += sample_hdr_buffer(uv + pixel * vec2(2, 2)) * 0.00390625;

	return hdr_color;
}

vec3 sample_hdr_buffer_uninterpolated(vec2 uv) {
	uv *= vec2(0.5, 1.0);
	ivec2 hdr_st = ivec2(uv * HDR_VBUF_0.bounds);
	hdr_st *= ivec2(2, 1);
	hdr_st += ivec2(HDR_VBUF_0.pos);

	vec3 hdr_color = sample_hdr_buffer_texel(hdr_st);

	return hdr_color;
}

vec3 sample_emitter_color_texel(ivec2 st){
    ivec2 color_st = st;

    color_st /= 2;

    // Clamp to ensure we sample a color at the edges
    color_st = clamp(color_st, ivec2(0, 0), ivec2(214, 119));

    bool top = color_st.y > int(59);

    if(top){
        color_st.y -= int(60);
    }

	uvec3 smp = uvec3(sample_buffer_texel(VBUF_COLOR_1, color_st) * 255.0) & 0xFFu;

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

    color_u = color_u & 0xFu;

    vec3 color = vec3(color_u << 4) / 255.0;

	if (color == vec3(0.0)) {
        // Blast an extremely bright magenta color to make color lookup misses obvious during debugging
		// return vec3(10.0, 0.0, 10.0);

		return vec3(0.0, 0.0, 0.0);
	}

    return color;
}

vec3 sample_emitter_color(vec2 uv) {
    ivec2 emitter_st = ivec2(uv * GLOW_BOUNDS);
	vec3 smp = sample_emitter_color_texel(emitter_st);
	return smp;
}

float sample_emitter_sdf(vec2 uv) {
	return texelFetch(BUFFER, ivec2(uv * vec2(107, 59)) + ivec2(215, 0), 0).b;
}

SDFSample sample_sdf_texel(ivec2 st) {
	ivec2 offset = ivec2(0);
	if(st.y < 121){
		offset = ivec2(0, 120);
	}
	ivec2 sample_st = ivec2(st) + offset;
	vec3 texel = texelFetch(BUFFER, sample_st, 0).rgb;

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

SDFSample sample_sdf(vec2 pos) {
    ivec2 offset = ivec2(0, 0);

	if(pos.y < 121.0){
        offset = ivec2(0, 121);
	}

	vec3 s_texel = texelFetch(BUFFER, ivec2(pos + offset), 0).rgb;

    float dist;
    uint material = 3u;

    if(pos.y < 121.0){
        material = (uint(s_texel.b * 255.0) >> 2) & 0x3u;
        dist = s_texel.r;
    } else {
        material = uint(s_texel.b * 255.0) & 0x3u;
        dist = s_texel.g;
    }

    return SDFSample(dist, material);
}

#endif