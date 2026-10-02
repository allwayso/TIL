```c
/* WARNING: This is buggy code */
float sum_elements(float a[], unsigned length) {
    int i;
    float result = 0;

    for (i = 0; i <= length-1; i++)
        result += a[i];
    return result;
}
```

典中典的内存访问错误，当 length 为 0 的时候会报错。

1. 当 length 为0时，1 为有符号数，被强制转换为无符号数1u,这一步的运算结果为 4294967295；
2. for 循环中 i 被隐式转换为无符号数，此时 i 最多能到达 4294967295u，再++ 又回到了0，因此循环永不停止
3. 内部代码 a[i] 被执行，但是数组a的合法下标为空集，此时 a[i] 一直在访问别人的内存，直到读到不可访问的页
4. 报错： 0xC0000005 = STATUS_ACCESS_VIOLATION —— 访问了非法内存

