<script>
  let { children } = $props();
</script>

<div
  class="min-h-screen bg-[#613563] font-mono flex flex-col items-center justify-center p-4 selection:bg-transparent select-none relative"
>
  {@render children()}

  <div class="absolute bottom-2 right-4 text-xs text-white/60 uppercase pointer-events-none">
    <span>(C) Ruben Uijtdewilligen 2026</span>
  </div>
</div>
