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

vec3 castRays(vec2 uv){
	const float rays = 256.0;
	const uint steps = 24u;

	float noise = getBlueNoise(0, ivec2(uv * GLOW_BOUNDS));
	vec3 color = vec3(0.0);

	vec2 center_pos = vec2(uv * GLOW_BOUNDS);

	SDFSample startSample = sample_sdf(center_pos);

    // Outwards facing rays
	for(float ray_index = 0.0; ray_index < rays; ray_index++){
		float angle = (ray_index / rays + noise) * 6.28318530718;
		vec2 dir = vec2(cos(angle), sin(angle));

		float rayIntensity = 1.0;
		float dt = 0.0;
        vec2 ray_start_pos = center_pos;

        // Cast rays away from origin to stop all the rays hitting a single pixel
        ray_start_pos += (dir * 2.5);

		vec2 pos = ray_start_pos;

        // Ray starting off-screen
        if(pos.x < 0.0 || pos.x > GLOW_BOUNDS.x || pos.y < 0.0 || pos.y > GLOW_BOUNDS.y){
            break;
        }

		for(uint step_index = 0; step_index < steps; step_index++){
			SDFSample sdfSample = sample_sdf(pos);
			float dist = sdfSample.dist * 255.0;

			// Check if emissive
			if(sdfSample.material == 2u){
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
				break;
			}

			dt += max(0.707, dist);

			pos = ray_start_pos + dir * dt;

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

		vec3 glow = monteCarlo(uv);

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
        outColor.rgb = build_sdf(buf_st, outColor.rgb);
	}
}
