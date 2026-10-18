<script setup lang="ts">
import { withBase } from 'vitepress';

/** Missing media stays an explicit storyboard, never a pretend player or screenshot. */
defineProps<{
  kind: 'image' | 'video';
  title: string;
  src?: string;
  alt?: string;
  poster?: string;
  captions?: string;
}>();
</script>

<template>
  <figure class="feature-media" :aria-label="title">
    <div v-if="!src" class="feature-media-plan" role="note">
      <span class="feature-media-status">
        {{ kind === 'video' ? 'Video planned' : 'Screenshot planned' }}
      </span>
      <p>No media yet. The description below is the planned demo, not a recording.</p>
    </div>
    <video
      v-else-if="kind === 'video'"
      :src="withBase(src)"
      :poster="poster ? withBase(poster) : undefined"
      controls
      playsinline
      preload="none"
    >
      <track
        v-if="captions"
        kind="captions"
        :src="withBase(captions)"
        srclang="en"
        label="English"
        default
      />
      <a :href="withBase(src)">Download the video</a>
    </video>
    <img v-else :src="withBase(src)" :alt="alt || title" loading="lazy" decoding="async" />
    <figcaption>
      <strong>{{ title }}</strong>
      <div class="feature-media-description"><slot /></div>
    </figcaption>
  </figure>
</template>

<style scoped>
.feature-media {
  margin: 20px 0;
  overflow: hidden;
  border: 1px solid var(--vp-c-divider);
  border-radius: 12px;
}

.feature-media-plan {
  padding: 20px;
  border-bottom: 1px dashed var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
}

.feature-media-status {
  color: var(--vp-c-brand-1);
  font-size: 12px;
  font-weight: 600;
}

.feature-media-plan p {
  margin: 8px 0 0;
  font-size: 14px;
  line-height: 1.6;
}

.feature-media img,
.feature-media video {
  display: block;
  width: 100%;
  height: auto;
  margin: 0;
}

.feature-media figcaption {
  padding: 16px 20px;
  font-size: 14px;
  line-height: 1.6;
}

.feature-media-description :deep(p),
.feature-media-description :deep(ol),
.feature-media-description :deep(ul) {
  margin: 8px 0 0;
}
</style>
