# Coding Style

## 推薦書單

- 軟體設計耦合的平衡之道：建構模組化軟體系統的通用設計原則
- [無瑕的程式碼－敏捷軟體開發技巧守則 Clean Code (by Uncle Bob)](https://www.tenlong.com.tw/products/9789862017050)
- [重構｜改善既有程式的設計 Refactoring, 2/e (by Martin Fowler)](https://www.tenlong.com.tw/products/9789865021832)
- Clean Architecture: A Craftsman's Guide to Software Structure and Design
    - OOP 是透過 polymorphism 來達到對原始碼依賴方向的絕對控制力
    - Race condition、deadlock、平行更新問題都來自於可變性
    - UTXO 就是不可變性，沒有變數存在，每次要計算餘額就直接加總 receipts。所以比特幣系統其實是一個「事件來源」，只儲存交易而非狀態，當需要狀態的時候只需計算事件加總
    - 當我們的計算跟儲存資源夠大，應用程式就可以是完全不可變的，完全的函式化，這就是 functional programming 