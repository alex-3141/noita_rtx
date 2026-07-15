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

// 1 pixel is taken off the particle buffer width so that the color and normal
// buffers can be 1/4 scale

const VBuffer GLOW = VBuffer(vec2(0.0, 0.0), vec2(431.0, 242.0));
const VBuffer VBUF_COLOR_0 = VBuffer(vec2(0.0, 0.0), vec2(108.0, 60.0));
const VBuffer VBUF_COLOR_1 = VBuffer(vec2(0.0, 60.0), vec2(108.0, 60.0));
const VBuffer VBUF_PARTICLE_0 = VBuffer(vec2(108.0, 0.0), vec2(107.0, 60.0));
const VBuffer VBUF_PARTICLE_1 = VBuffer(vec2(108.0, 60.0), vec2(107.0, 60.0));
const VBuffer VBUF_NORMAL_0 = VBuffer(vec2(214.0, 0.0), vec2(108.0, 60.0));
const VBuffer VBUF_NORMAL_1 = VBuffer(vec2(322.0, 0.0), vec2(108.0, 60.0));
const VBuffer VBUF_HDR = VBuffer(vec2(214.0, 60.0), vec2(214.0, 60.0));
const VBuffer SDF = VBuffer(vec2(0.0, 120.0), vec2(431.0, 121.0));

bool within(VBuffer vbuffer) {
	return st.x >= vbuffer.pos.x &&
		   st.x < vbuffer.size.x + vbuffer.pos.x &&
		   st.y >= vbuffer.pos.y &&
		   st.y < vbuffer.size.y + vbuffer.pos.y;
}

ivec2 uv_to_vbuffer_st(vec2 uv, VBuffer vbuffer) {
	return ivec2(round(uv * (vbuffer.size - vec2(1.0))));
}

vec2 global_st_to_vbuffer_uv(ivec2 st, VBuffer vbuffer) {
	vec2 vbuf_st = vec2(st) - vbuffer.pos;
	return vbuf_st / (vbuffer.size - vec2(1.0));
}

ivec2 global_st_to_vbuffer_st(ivec2 st, VBuffer vbuffer) {
	return st - ivec2(vbuffer.pos);
}

ivec2 local_st_to_vbuffer_st(ivec2 st, VBuffer vbuffer) {
	return st + ivec2(vbuffer.pos);
}

vec3 sample_buffer_texel(VBuffer vbuffer, ivec2 st) {
	st += ivec2(vbuffer.pos);
	return texelFetch(BUFFER, st, 0).rgb;
}

vec2 vbuffer_st_to_vbuffer_uv(ivec2 st, VBuffer vbuffer) {
    return vec2(st) / (vbuffer.size - vec2(1.0));
}

vec3 sample_hdr_buffer_texel(ivec2 st) {
	st = clamp(st, ivec2(0), ivec2(106, 59));
	ivec2 hdr_st = st * ivec2(2, 1) + ivec2(VBUF_HDR.pos);

	vec3 high_sample = texelFetch(BUFFER, hdr_st + ivec2(0, 0), 0).rgb;
	vec3 low_sample  = texelFetch(BUFFER, hdr_st + ivec2(1, 0), 0).rgb;

	uvec3 high_bits = uvec3(high_sample * 255.0) << 8;
	uvec3 low_bits = uvec3(low_sample * 255.0);
	vec3 hdr_color = vec3(high_bits | low_bits) / 255.0;
	return hdr_color;
}

vec3 sample_hdr_buffer(vec2 uv) {
	// uv += 0.5 / vec2(106.0, 59.0);
	ivec2 st = ivec2(floor(uv * vec2(106.0, 59.0)));

	vec3 hdr_color_ul = sample_hdr_buffer_texel(st + ivec2(0, 0));
	vec3 hdr_color_ur = sample_hdr_buffer_texel(st + ivec2(1, 0));
	vec3 hdr_color_ll = sample_hdr_buffer_texel(st + ivec2(0, 1));
	vec3 hdr_color_lr = sample_hdr_buffer_texel(st + ivec2(1, 1));

    // lerp
	vec2 f = fract(uv * vec2(106.0, 59.0));
	vec3 hdr_color_top = mix(hdr_color_ul, hdr_color_ur, f.x);
	vec3 hdr_color_bottom = mix(hdr_color_ll, hdr_color_lr, f.x);
	vec3 hdr_color = mix(hdr_color_top, hdr_color_bottom, f.y);

	return hdr_color;
}

vec3 sample_hdr_buffer_gaussian_3x3(vec2 uv) {
	vec2 pixel = 1.0 / vec2(107.0, 60.0);

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
	vec2 pixel = 1.0 / vec2(106.0, 59.0);

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
	ivec2 st = ivec2(round(uv * vec2(106.0, 59.0)));
	vec3 hdr_color = sample_hdr_buffer_texel(st);
	return hdr_color;
}

vec3 sample_emitter_color(vec2 uv) {
    ivec2 st = ivec2(round(uv * (VBUF_COLOR_1.size - vec2(1.0)) + VBUF_COLOR_1.pos));
	vec3 color = texelFetch(BUFFER, st, 0).rgb;

	if (color == vec3(0.0)) {
        // Blast an extremely bright magenta color to make color lookup misses obvious during debugging
		// return vec3(2.0, 0.0, 2.0);
	}

	return color;
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

SDFSample sample_sdf(in vec2 pos) {
	pos = round(pos);
    ivec2 offset = ivec2(0, 0);

	if(pos.y < 121.0){
        offset = ivec2(0, 120);
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