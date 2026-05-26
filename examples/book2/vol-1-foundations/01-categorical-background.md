# 第一章：范畴化背景

## #h-53a7c9e6a4edcceb 对象、态射与纤维化

我们把一个几何对象的局部数据组织为带纤维的范畴。后续所有多卷引用都从这个基础语言出发。

定义（纤维化站点）：设 $\mathcal{C}$ 是一个带 Grothendieck 拓扑的范畴。若函子 $p:\mathcal{E}\to\mathcal{C}$ 对每个覆盖族都允许笛卡尔提升，则称 $(\mathcal{E},p)$ 为一个**纤维化站点**。

由纤维化站点出发，我们可以给出下降数据的最小闭合条件。

引理 #h-7bf3363aeb9bd429（下降核引理）：对于任意有限覆盖 $U_\bullet\to X$，纤维化站点上的兼容族形成一个等化子
$$
\mathrm{Eq}\left(\prod_i \mathcal{E}_{U_i}\rightrightarrows \prod_{i,j}\mathcal{E}_{U_i\times_X U_j}\right).
$$

## #h-3e7e6109986294d4 函子性

命题 #h-c3490c0056062269（基变换稳定性）：若 $f:Y\to X$ 是平坦态射，则纤维化站点中的下降核在基变换 $f^\ast$ 下保持有限极限。

这个命题会在第二卷用于证明 @h-1bec2cb6f1af5555，并在第三卷的 @h-4c2af40e85162c37 中以谱序列语言重新出现。

