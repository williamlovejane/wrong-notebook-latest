/*
 * 每次页面加载完成后注入，补齐 WebView 不支持的浏览器能力：
 * - window.print()：交给系统打印（可另存为 PDF）
 * - <a download> 下载 blob:/data: 链接：读取内容后交给原生「另存为」
 */
(function () {
    if (window.__wrongNotebookAndroidReady) return;
    window.__wrongNotebookAndroidReady = true;
    var bridge = window.WrongNotebookAndroid;
    if (!bridge) return;

    window.print = function () {
        bridge.print();
    };

    // 页面通常在 click() 之后立即 revoke，延迟释放，保证下面的 fetch 能读到内容
    var revoke = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = function (url) {
        setTimeout(function () { revoke(url); }, 60000);
    };

    function save(href, name) {
        fetch(href, { credentials: 'same-origin' })
            .then(function (response) { return response.blob(); })
            .then(function (blob) {
                var reader = new FileReader();
                reader.onload = function () {
                    bridge.saveFile(String(reader.result), name || '', blob.type || '');
                };
                reader.readAsDataURL(blob);
            })
            .catch(function (error) {
                console.error('[WrongNotebookAndroid] download failed', error);
            });
    }
    window.__wrongNotebookSave = save;

    function isLocalDownload(anchor) {
        return !!anchor && anchor.hasAttribute('download') && /^(blob|data):/i.test(anchor.href);
    }

    // 脚本创建的链接常未插入文档就调用 click()，因此同时拦截原型方法和文档点击
    var click = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
        if (isLocalDownload(this)) {
            save(this.href, this.getAttribute('download'));
            return;
        }
        return click.call(this);
    };
    document.addEventListener('click', function (event) {
        var target = event.target;
        var anchor = target && target.closest ? target.closest('a') : null;
        if (isLocalDownload(anchor)) {
            event.preventDefault();
            save(anchor.href, anchor.getAttribute('download'));
        }
    }, true);
})();
