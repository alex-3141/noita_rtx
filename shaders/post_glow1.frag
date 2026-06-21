#version 400

// inputs
uniform sampler2D 	tex_glow_prev_frame;
uniform vec2        one_per_glow_texture_size;
uniform float		time;

out vec4 outColor;

#define BUFFER tex_glow_prev_frame

// Lygia includes
#include "../lygia/color/space/srgb2rgb.glsl"
#include "../lygia/color/space/rgb2srgb.glsl"
#include "../lygia/color/luminance.glsl"

// Other includes
#include "./lib/common.frag"
#include "./lib/vbuffer.frag"
#include "./lib/material.frag"
#include "./lib/sdf.frag"
#include "./lib/noise.frag"


vec3 sample_emitter_color_texel(ivec2 st){
    ivec2 color_st = st;

    color_st /= 2;

    // Clamp to ensure we sample a color at the edges
    color_st = clamp(color_st, ivec2(0, 0), ivec2(214, 119));

    bool top = color_st.y > int(59);

    if(top){
        color_st.y -= int(60);
    }

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

#define LIGHT_BLEED

vec3 castRays(vec2 uv){
	const float rays = 128.0;
	const uint steps = 24u;

    // TODO: Optimisation

	int frame = get_frame();
	// frame = 4;
	float noise = getBlueNoise(frame, ivec2(uv * GLOW_BOUNDS));
	// noise = 0.0;
	vec3 color = vec3(0.0);

	vec2 start_pos = vec2(uv * GLOW_BOUNDS);

	SDFSample startSample = sample_sdf(start_pos);

	for(float ray_index = 0.0; ray_index < rays; ray_index++){
		float angle = (ray_index / rays + noise) * 6.28318530718;
		vec2 dir = vec2(cos(angle), sin(angle));

		float rayIntensity = 1.0;
		float dt = 0.0;
		// vec2 pos = start_pos;
		vec2 pos = start_pos;

		// vec2 pos = vec2(st) + dir * startSample.dist * 255.0;
        pos += dir * 2.0;

        // Ray starting off-screen
        if(pos.x < 0.0 || pos.x > GLOW_BOUNDS.x || pos.y < 0.0 || pos.y > GLOW_BOUNDS.y){
            break;
        }

		for(uint step_index = 0; step_index < steps; step_index++){

			// TODO: A better way to convert coordiante spaces
			SDFSample sdfSample = sample_sdf(pos);

			float dist = sdfSample.dist * 255.0;

			// Check if emissive
            // Check that at least 1 step is taken to prevent fireflies
			if(sdfSample.material == 2u && step_index > 1u){
			// if(sdfSample.material == 2u){
			// if(sdfSample.material == 2u){
                vec3 emitter_color = sample_emitter_color(pos / GLOW_BOUNDS);
				vec3 color_linear = srgb2rgb(emitter_color);

				// Stop on surfaces
				// TODO: Add in a screen edge factor to smooth over pop-in
				color += color_linear * rayIntensity;
				break;
			}

			float occlusionFactor = materialOcclusionFactor(sdfSample.material);
			rayIntensity *= pow(occlusionFactor, dist);

			if(rayIntensity < 0.005){
                // TODO: Skip rays that are masked by this pixel, eg.
                // float half_arc_length = asin(0.5 / dist);
                // ray_index += int(rays * half_arc_length);
				break;
			}

			dt += max(0.707, dist);

			pos = start_pos + dir * dt;

            // Ray off-screen
			if(pos.x < 0.0 || pos.x > GLOW_BOUNDS.x || pos.y < 0.0 || pos.y > GLOW_BOUNDS.y){
				break;
			}

		}
	}

	return color / rays;
}

vec3 monteCarlo(vec2 uv){
	// Glow monte carlo

	vec3 color = castRays(uv);

    // Expand into 16 bit range
    color *= 255.0;

	return color;
}

void main()
{
	outColor = vec4(0.0, 0.0, 0.0, 1.0);
	outColor.rgb = texelFetch(BUFFER, st, 0).rgb;

    // Copy
	if (within(VBUF_COLOR_0)) {
        outColor.rgb = texelFetch(BUFFER, st, 0).rgb;
    }

    // Copy
	if (within(VBUF_COLOR_1)) {
        outColor.rgb = texelFetch(BUFFER, st, 0).rgb;
    }

	if (within(HDR_VBUF_0)) {
        ivec2 hdr_st = global_st_to_vbuffer_st(st, HDR_VBUF_0);
		ivec2 snap_st = ivec2(hdr_st.x & ~1, hdr_st.y);
		vec2 uv = vbuffer_st_to_vbuffer_uv(snap_st, HDR_VBUF_0);

        // TODO: Test how much of a performance hit doubling this up does
		vec3 glow = monteCarlo(uv);

        // TODO: adding a multiplier based on distance may help reduce fireflies and aliasing

		// float dist = sample_emitter_sdf(uv);

        // if(dist == 1.0/255.0) {
        //     glow *= 0.1;
        // }
        // if(dist == 2.0/255.0) {
        //     glow *= 0.5;
        // }
        // if(dist == 3.0/255.0) {
        //     glow *= 0.5;
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
	}


	if (within(SDF)) {
		ivec2 buf_st = global_st_to_vbuffer_st(st, SDF);
        outColor.rgb = build_sdf(buf_st);
	}

    if (within(EMITTER_SDF)) {
		vec3 prev_frame = texelFetch(BUFFER, st, 0).rgb;

        float dist = emitterDistanceFieldPassHorizontal(st);

        outColor.rgb = vec3(
            prev_frame.r,
            dist,
            prev_frame.b
        );
    }
}
