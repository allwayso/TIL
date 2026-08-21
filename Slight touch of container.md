## 尝试解决的问题

[[First read of Cordis paper#偶遇容器]]中给出了遇到 container 这个概念的情景，我希望能够对 container、image、registry 和 docker compose 产生基本的了解

## 正文

由于 [docker官方文档](https://docs.docker.com/) 制作的相当完善，所以以下内容只对其中每个文档的内容做大致的描述，具体内容在文档中展开

### container

docker官方文档：[What is a container? | Docker Docs](https://docs.docker.com/get-started/docker-concepts/the-basics/what-is-a-container/) 

关于为什么需要 container ，文中以一个 web 应用为例，列出了一些理由：
1. 版本统一：团队中各个开发成员的版本应当统一
2. 依赖独立：当前应用的依赖版本不应当受计算机上已有内容影响
3. 相互隔离：同一个机器、内核上运行着不同的服务，他们之间不应该相互影响

所以我们需要一个 container，其定义为：==containers are isolated processes for each of your app's components==，即容器是应用程序中每个组件的隔离进程。一个优秀的容器应该是==自包含、隔离、独立、可移植==的。

这听上去和虚拟机（virtual machine）很像，简而言之，虚拟机是一个完整的操作系统，具有自己的内核、程序和应用程序，更重；容器只是隔离在进程上的一个服务，包含其运行所需要的所有文件，更轻。

### image

container 只有 run 起来才是一个隔离的进程，在此之前是一个静态的软件包，我们将其称为 image 。Image 包含运行容器所需的所有文件、二进制文件、库和 config，通过 `docker pull <image_name>` 从 https://hub.docker.com/ 或者其他注册表中下载到本地。

Image 遵循以下两个原则：
1. 镜像由多个层组成。每层表示一组文件系统更改，包括添加、删除、修改文件的记录
2. 镜像本身不可变。镜像一经创建即不可变，只能新建镜像或者在原镜像基础上进行修改，但是修改后的镜像实际上不同于原镜像

> layer分为两种，在构建过程中的 FROM，COPY，RUN 等操作其实都是只读层，这些层一经创建即不可变更，由内容哈希保证，一旦修改等于产生新的镜像；在所有只读层上方有一个可变层，运行时可以进行改动。

### registry

定义：An image registry is a centralized location for storing and sharing your container images，即镜像注册表是存储和共享容器镜像的集中位置。

注册表可以为公开的，也可以是私有的，[Docker Hub](https://hub.docker.com/)是任何人都能够使用的注册表。这里需要区分 Repository 和 Registry：Registry 包含 Repository，而 Repository 包含 image。

### docker compose

之前的内容都是单容器应用，但是如果需要多服务，比如前后端、数据库、缓存等等同时进行，那么最佳实践是将其放置在不同的容器中。

要启动这些不同的服务容器，固然可以通过多个 docker run 来执行，但是这样做显然有些愚蠢。所以我们通过单个 YAML 定义所有的容器及其配置，通过单一命令 `docker compose up` 来启动多容器，通过  `docker compose down` 来停止。