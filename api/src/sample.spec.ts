describe('Sample Test Suite', () => {
  test('should add two numbers correctly', () => {
    const sum = 2 + 3;
    expect(sum).toBe(5);
  });

  test('should return correct string', () => {
    const greeting = 'Hello, TypeScript!';
    expect(greeting).toContain('TypeScript');
  });

  test('async operation example', async () => {
    const promise = Promise.resolve('success');
    await expect(promise).resolves.toBe('success');
  });
});
