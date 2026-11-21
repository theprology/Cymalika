# Try the Cipher walkthrough

This is a disposable learning exercise with one intentional bug: `total_price` adds price and quantity instead of multiplying them. Both tests fail until the bug is fixed.

1. Copy this folder somewhere convenient and open that copy with **Open project** in Cipher.
2. Select your existing model and choose **Build**.
3. Send: “Fix the basket total calculation. Find the relevant source and tests yourself. Make the smallest fix, then run python3 -m unittest discover -s tests -v.”
4. Review the proposed edit and test command before approving them.
5. Check that the saved calculation multiplies and that both tests pass.

Python 3 is required for this exercise. On Windows, ask the model to use `py -3` if `python3` is unavailable.

The test command is:

```sh
python3 -m unittest discover -s tests -v
```

This example is documentation only. Cipher does not install or open it automatically.
