document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('show-panel-btn');
    if (btn) {
        btn.addEventListener('click', () => {
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                if (tabs.length === 0) return;
                
                // 发送消息给 content script
                chrome.tabs.sendMessage(tabs[0].id, {action: "show_panel"}, function(response) {
                    if (chrome.runtime.lastError) {
                        // 忽略错误（例如不在目标页面上）
                        console.log(chrome.runtime.lastError.message);
                    }
                });
            });
        });
    }
});
