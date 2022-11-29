x = linspace(0,10,1000)
y = f(x)
plot(x,y)


function ret = f(z)
    ret = z.^2
end