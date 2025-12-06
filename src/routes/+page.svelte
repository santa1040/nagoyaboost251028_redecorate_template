<script>
    import LeftPanel from '../components/LeftPanel.svelte';
    import RightPanel from '../components/RightPanel.svelte';
  </script>
  
  <div class="container">
    <div class="left-panel">
      <LeftPanel />
    </div>
    <div class="right-panel">
      <RightPanel />
    </div>
  </div>
  
  <style>
    .container {
      display: flex;
      width: 100%;
      height: 100vh;
    }
    
    .left-panel {
      width: 50%;
    }
    
    .right-panel {
      width: 50%;
    }
  </style>