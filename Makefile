.PHONY: test lint

test:
	python3 -m unittest discover -s tests -p 'test_*.py' -v

lint:
	python3 -m py_compile src/*.py tests/*.py
