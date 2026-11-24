"""Reloads optional pricing plugins at runtime."""
import imp
import importlib


def reload_plugin(name):
    module = importlib.import_module(name)
    return imp.reload(module)
