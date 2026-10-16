<script setup lang="ts">
import DefaultFeature from '../../node_modules/vitepress/dist/client/theme-default/components/VPFeature.vue';
</script>

<template>
  <!-- Keep the pinned default card; its article wrapper otherwise has an empty link name. -->
  <DefaultFeature v-bind="$attrs" :aria-label="$attrs.title" />
</template>
