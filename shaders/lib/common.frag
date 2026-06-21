#define FRAME_COUNTER ivec2(430, 0)

int get_frame(){
	vec4 t = texelFetch(BUFFER, FRAME_COUNTER, 0);
	int frame = int(t.r * 255.0 + t.g * 255.0 * 256.0 + t.b * 255.0 * 256.0 * 256.0);
	return frame;
}

ivec2 st = ivec2(gl_FragCoord.xy);
