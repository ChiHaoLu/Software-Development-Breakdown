# Network

### 系統設計的必備知識點

- 網路協議
    - DNS(Route53)
    - Subnet
    - IPv4
    - Masking
    - NACL
- 雲端平台的重要網路架構
    - AWS: VPC, SG/NACL, IGW, NAT
    - GCP: VPC, Firewall Rule, NAT, Default Internet Gateway

### IP

127.0.0.1 is myself (loopback address)
192.168.1.1 is a private IP (gateway) for home routers etc.
10.0.0.0/8 is the address range for private networks
255.255.255.255 is the broadcast address (for all)
8.8.8.8 is Google's public DNS server
169.254.0.0/16 is the auto-assigned address (APIPA) upon DHCP failure
0.0.0.0 → No address / meaning all addresses
244.0.0.1 is part of the multicast address range

### 封包（和網路管理有關）

> 很多人會做搶票機器人但都是用 Selenium，其實那都太慢了呵呵

- [十分钟学会wireshark解析网络包](https://www.youtube.com/watch?v=ds-R327-4Oo)
- [【教學】抓包工具可以做什麼？ Fiddler【小宇Boi】](https://www.youtube.com/watch?v=emzyDW3Iqt8)
- [Wireshark 教學 - 封包分析實作 | 系統網路管理培訓 #4](https://www.youtube.com/watch?v=Bhs173xh4fk)
- [大麥網離職工程師教你如何科學搶購演唱會門票](https://www.youtube.com/watch?v=e0xdgDHxnQ0)
- [網路頂級掠食者Wireshark抓包從入門到實戰](https://www.youtube.com/watch?v=0uZfyduC0A0)

### 基本原理（面試常考）
- [【乾貨】10分鐘動畫帶你了解網路是如何運作的！](https://www.youtube.com/watch?v=NvA_Zqepyk0)
- [【干货】10分钟带你了解浏览器运行原理！](https://www.youtube.com/watch?v=jaPpP3cdgDQ)