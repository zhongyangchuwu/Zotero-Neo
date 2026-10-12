<template>
  <aside class="source-version-notice" role="note" aria-label="版本说明">
    <p>
      当前源码文档，包含未发布的 v0.2 功能。公开下载仍为 v0.1.0，请留意功能与键位差异。
      <a
        href="https://github.com/zhongyangchuwu/Zotero-Neo/releases/download/v0.1.0/zotero-neo.xpi"
        target="_blank"
        rel="noopener noreferrer"
      >
        下载官方 v0.1.0 XPI
      </a>
    </p>
  </aside>
</template>

<style scoped>
.source-version-notice {
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  color: var(--vp-c-text-2);
  font-size: 13px;
  line-height: 1.5;
}

.source-version-notice p {
  max-width: 1152px;
  margin: 0 auto;
  padding: 9px 24px;
}

.source-version-notice a {
  color: var(--vp-c-brand-1);
  font-weight: 600;
}

@media (max-width: 640px) {
  .source-version-notice {
    font-size: 12px;
  }

  .source-version-notice p {
    padding: 9px 16px;
  }
}
</style>
