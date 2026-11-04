.PHONY: test prepare run report

test:
	python -m unittest discover -s tests -v

prepare:
	python -m benchmark prepare --per-generation 12

run:
	python -m benchmark run

report:
	python -m benchmark report
