// TOTAL BUFFER SIZE: 431x242
// QUARTER RES VBUFFER SIZE: 107x60
// LAYOUT:
//     X: 107, 107, 107, 107, 2
//     Y: 60, 60, 1, 121

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

vec3 sample_hdr_buffer_texel(VBuffer vbuffer, ivec2 iv) {
	// Don't sample outside buffer
	iv = clamp(iv, ivec2(vbuffer.pos), ivec2(vbuffer.pos + vbuffer.bounds));

	vec3 high_sample = texelFetch(BUFFER, iv + ivec2(0, 0), 0).rgb;
	vec3 low_sample  = texelFetch(BUFFER, iv + ivec2(1, 0), 0).rgb;

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
